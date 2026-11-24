import type { BoolNode, BoolOp, ComplexityMetrics, NotationStyle, ParsedBoolean } from './types';

type TokenKind =
  | 'IDENT'
  | 'CONST'
  | 'NOT'
  | 'PRIME'
  | 'AND'
  | 'OR'
  | 'XOR'
  | 'XNOR'
  | 'NAND'
  | 'NOR'
  | 'IMPLIES'
  | 'LPAREN'
  | 'RPAREN'
  | 'EQ'
  | 'EOF';

interface Token {
  readonly kind: TokenKind;
  readonly text: string;
  readonly pos: number;
}

const KEYWORD_MAP: Readonly<Record<string, TokenKind>> = {
  AND: 'AND',
  OR: 'OR',
  NOT: 'NOT',
  XOR: 'XOR',
  XNOR: 'XNOR',
  NAND: 'NAND',
  NOR: 'NOR',
  TRUE: 'CONST',
  FALSE: 'CONST',
};

const MAX_VARIABLES = 8;

function isAlpha(ch: string): boolean {
  return (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || ch === '_';
}

function isIdentChar(ch: string): boolean {
  return isAlpha(ch) || (ch >= '0' && ch <= '9');
}

function tokenize(raw: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = raw.length;

  while (i < n) {
    const ch = raw[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (ch === '(' || ch === '[' || ch === '{') {
      tokens.push({ kind: 'LPAREN', text: '(', pos: i });
      i++;
      continue;
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      tokens.push({ kind: 'RPAREN', text: ')', pos: i });
      i++;
      continue;
    }
    if (ch === '=') {
      tokens.push({ kind: 'EQ', text: '=', pos: i });
      i++;
      continue;
    }
    if (ch === '\'' || ch === '’' || ch === '′') {
      tokens.push({ kind: 'PRIME', text: '\'', pos: i });
      i++;
      continue;
    }
    if (ch === '!' || ch === '~' || ch === '¬') {
      tokens.push({ kind: 'NOT', text: ch, pos: i });
      i++;
      continue;
    }
    if (ch === '<' && raw.slice(i, i + 3) === '<->') {
      tokens.push({ kind: 'XNOR', text: '<->', pos: i });
      i += 3;
      continue;
    }
    if (ch === '-' && raw[i + 1] === '>') {
      tokens.push({ kind: 'IMPLIES', text: '->', pos: i });
      i += 2;
      continue;
    }
    if (ch === '&') {
      if (raw[i + 1] === '&') {
        tokens.push({ kind: 'AND', text: '&&', pos: i });
        i += 2;
      } else {
        tokens.push({ kind: 'AND', text: '&', pos: i });
        i++;
      }
      continue;
    }
    if (ch === '|') {
      if (raw[i + 1] === '|') {
        tokens.push({ kind: 'OR', text: '||', pos: i });
        i += 2;
      } else {
        tokens.push({ kind: 'OR', text: '|', pos: i });
        i++;
      }
      continue;
    }
    if (ch === '*' || ch === '·' || ch === '•' || ch === '∧' || ch === '⋅') {
      tokens.push({ kind: 'AND', text: ch, pos: i });
      i++;
      continue;
    }
    if (ch === '+' || ch === '∨') {
      tokens.push({ kind: 'OR', text: ch, pos: i });
      i++;
      continue;
    }
    if (ch === '^' || ch === '⊕') {
      tokens.push({ kind: 'XOR', text: ch, pos: i });
      i++;
      continue;
    }
    if (ch === '⊙' || ch === '↔') {
      tokens.push({ kind: 'XNOR', text: ch, pos: i });
      i++;
      continue;
    }
    if (ch === '↑') {
      tokens.push({ kind: 'NAND', text: ch, pos: i });
      i++;
      continue;
    }
    if (ch === '↓') {
      tokens.push({ kind: 'NOR', text: ch, pos: i });
      i++;
      continue;
    }
    if (ch === '→') {
      tokens.push({ kind: 'IMPLIES', text: ch, pos: i });
      i++;
      continue;
    }
    if (ch === '0' || ch === '1') {
      tokens.push({ kind: 'CONST', text: ch, pos: i });
      i++;
      continue;
    }
    if (isAlpha(ch)) {
      const start = i;
      while (i < n && isIdentChar(raw[i])) i++;
      const word = raw.slice(start, i);
      const upper = word.toUpperCase();
      const kw = KEYWORD_MAP[upper];
      if (kw) {
        if (kw === 'CONST') {
          tokens.push({ kind: 'CONST', text: upper === 'TRUE' ? '1' : '0', pos: start });
        } else {
          tokens.push({ kind: kw, text: upper, pos: start });
        }
      } else if (word.length > 1 && /^[A-Z]+$/.test(word)) {
        // Classic digital-logic juxtaposition: AB -> A * B, ABC -> A * B * C
        for (let k = 0; k < word.length; k++) {
          tokens.push({ kind: 'IDENT', text: word[k], pos: start + k });
        }
      } else {
        tokens.push({ kind: 'IDENT', text: word, pos: start });
      }
      continue;
    }

    throw new Error(`Unexpected character "${ch}" at position ${i + 1}.`);
  }

  tokens.push({ kind: 'EOF', text: '', pos: n });
  return tokens;
}

function canStartPrimary(kind: TokenKind): boolean {
  return kind === 'IDENT' || kind === 'CONST' || kind === 'NOT' || kind === 'LPAREN';
}

export function parseBoolean(input: string): ParsedBoolean {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Enter a Boolean expression such as A*B + !A*C or (A + B)(A + C).');
  }

  const allTokens = tokenize(trimmed);
  let outputName = 'Y';
  let tokens = allTokens;

  // Support optional "Y = <expr>" assignment prefix
  const eqIndex = allTokens.findIndex((tok) => tok.kind === 'EQ');
  if (eqIndex !== -1) {
    if (eqIndex === 1 && allTokens[0].kind === 'IDENT') {
      outputName = allTokens[0].text;
      tokens = allTokens.slice(2);
    } else {
      throw new Error('Use a single output name before "=", e.g. Y = A*B + C.');
    }
  }

  if (tokens.length <= 1) {
    throw new Error('Expression is empty after "=".');
  }

  let idx = 0;
  const peek = () => tokens[idx];
  const consume = () => tokens[idx++];

  // Precedence (lowest to highest):
  // IMPLIES -> OR / NOR -> XOR / XNOR -> AND / NAND (incl. implicit AND) -> prefix NOT -> postfix PRIME -> primary
  function parseImplies(): BoolNode {
    let left = parseOr();
    while (peek().kind === 'IMPLIES') {
      consume();
      const right = parseImplies();
      // A -> B  ===  !A + B
      left = makeGate('OR', [makeNot(left), right]);
    }
    return left;
  }

  function parseOr(): BoolNode {
    let left = parseXor();
    while (peek().kind === 'OR' || peek().kind === 'NOR') {
      const opTok = consume();
      const right = parseXor();
      if (opTok.kind === 'OR') {
        left = appendGate('OR', left, right);
      } else {
        left = makeGate('NOR', [left, right]);
      }
    }
    return left;
  }

  function parseXor(): BoolNode {
    let left = parseAnd();
    while (peek().kind === 'XOR' || peek().kind === 'XNOR') {
      const opTok = consume();
      const right = parseAnd();
      if (opTok.kind === 'XOR') {
        left = appendGate('XOR', left, right);
      } else {
        left = makeGate('XNOR', [left, right]);
      }
    }
    return left;
  }

  function parseAnd(): BoolNode {
    let left = parseUnary();
    while (true) {
      const next = peek();
      if (next.kind === 'AND' || next.kind === 'NAND') {
        consume();
        const right = parseUnary();
        if (next.kind === 'AND') {
          left = appendGate('AND', left, right);
        } else {
          left = makeGate('NAND', [left, right]);
        }
      } else if (canStartPrimary(next.kind)) {
        // Implicit AND: A(B+C), A'B, (A+B)(C+D)
        const right = parseUnary();
        left = appendGate('AND', left, right);
      } else {
        break;
      }
    }
    return left;
  }

  function parseUnary(): BoolNode {
    if (peek().kind === 'NOT') {
      consume();
      const operand = parseUnary();
      return makeNot(operand);
    }
    return parsePostfix();
  }

  function parsePostfix(): BoolNode {
    let node = parsePrimary();
    while (peek().kind === 'PRIME') {
      consume();
      node = makeNot(node);
    }
    return node;
  }

  function parsePrimary(): BoolNode {
    const tok = peek();
    if (tok.kind === 'CONST') {
      consume();
      return { kind: 'const', value: tok.text === '1' ? 1 : 0 };
    }
    if (tok.kind === 'IDENT') {
      consume();
      return { kind: 'var', name: tok.text };
    }
    if (tok.kind === 'LPAREN') {
      consume();
      const inner = parseImplies();
      if (peek().kind !== 'RPAREN') {
        throw new Error(`Missing closing parenthesis ")" near position ${tok.pos + 1}.`);
      }
      consume();
      return inner;
    }
    throw new Error(
      tok.kind === 'EOF'
        ? 'Unexpected end of expression — missing an operand.'
        : `Unexpected token "${tok.text}" at position ${tok.pos + 1}.`,
    );
  }

  const ast = parseImplies();
  if (peek().kind !== 'EOF') {
    const extra = peek();
    throw new Error(`Unexpected "${extra.text}" at position ${extra.pos + 1}.`);
  }

  const variables = collectVariables(ast);
  if (variables.length > MAX_VARIABLES) {
    throw new Error(
      `Found ${variables.length} distinct variables (${variables.join(', ')}). Maximum supported is ${MAX_VARIABLES} variables.`,
    );
  }

  // Avoid collision if outputName matches one of the input variables
  if (variables.includes(outputName)) {
    outputName = outputName === 'Y' ? 'F' : `${outputName}_out`;
  }

  return { outputName, ast, variables };
}

export function makeConst(value: 0 | 1): BoolNode {
  return { kind: 'const', value };
}

export function makeVar(name: string): BoolNode {
  return { kind: 'var', name };
}

export function makeNot(operand: BoolNode): BoolNode {
  return { kind: 'not', operand };
}

export function makeGate(op: BoolOp, args: readonly BoolNode[]): BoolNode {
  return { kind: 'gate', op, args };
}

function appendGate(op: 'AND' | 'OR' | 'XOR', left: BoolNode, right: BoolNode): BoolNode {
  const leftArgs = left.kind === 'gate' && left.op === op ? left.args : [left];
  const rightArgs = right.kind === 'gate' && right.op === op ? right.args : [right];
  return { kind: 'gate', op, args: [...leftArgs, ...rightArgs] };
}

export function collectVariables(node: BoolNode): string[] {
  const set = new Set<string>();
  const walk = (n: BoolNode) => {
    if (n.kind === 'var') {
      set.add(n.name);
    } else if (n.kind === 'not') {
      walk(n.operand);
    } else if (n.kind === 'gate') {
      for (const arg of n.args) walk(arg);
    }
  };
  walk(node);
  return [...set].sort((a, b) => a.localeCompare(b, 'en'));
}

export function evaluateBool(node: BoolNode, env: Readonly<Record<string, 0 | 1>>): 0 | 1 {
  switch (node.kind) {
    case 'const':
      return node.value;
    case 'var':
      return env[node.name] ?? 0;
    case 'not':
      return evaluateBool(node.operand, env) === 1 ? 0 : 1;
    case 'gate': {
      const vals = node.args.map((a) => evaluateBool(a, env));
      switch (node.op) {
        case 'AND':
          return vals.every((v) => v === 1) ? 1 : 0;
        case 'OR':
          return vals.some((v) => v === 1) ? 1 : 0;
        case 'NAND':
          return vals.every((v) => v === 1) ? 0 : 1;
        case 'NOR':
          return vals.some((v) => v === 1) ? 0 : 1;
        case 'XOR': {
          let parity = 0;
          for (const v of vals) parity ^= v;
          return parity === 1 ? 1 : 0;
        }
        case 'XNOR': {
          let parity = 0;
          for (const v of vals) parity ^= v;
          return parity === 0 ? 1 : 0;
        }
      }
    }
  }
}

export function astEquals(a: BoolNode, b: BoolNode): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'const' && b.kind === 'const') return a.value === b.value;
  if (a.kind === 'var' && b.kind === 'var') return a.name === b.name;
  if (a.kind === 'not' && b.kind === 'not') return astEquals(a.operand, b.operand);
  if (a.kind === 'gate' && b.kind === 'gate') {
    if (a.op !== b.op || a.args.length !== b.args.length) return false;
    return a.args.every((arg, i) => astEquals(arg, b.args[i]));
  }
  return false;
}

export function astKey(node: BoolNode): string {
  switch (node.kind) {
    case 'const':
      return String(node.value);
    case 'var':
      return `v:${node.name}`;
    case 'not':
      return `!(${astKey(node.operand)})`;
    case 'gate':
      return `${node.op}(${node.args.map(astKey).join(',')})`;
  }
}

export function measureComplexity(node: BoolNode): ComplexityMetrics {
  let gates = 0;
  let literals = 0;
  let twoInputGateEquiv = 0;

  const walk = (n: BoolNode): number => {
    if (n.kind === 'const') return 0;
    if (n.kind === 'var') {
      literals += 1;
      return 0;
    }
    if (n.kind === 'not') {
      gates += 1;
      twoInputGateEquiv += 1;
      return 1 + walk(n.operand);
    }
    gates += 1;
    twoInputGateEquiv += Math.max(1, n.args.length - 1);
    let maxChild = 0;
    for (const arg of n.args) {
      const d = walk(arg);
      if (d > maxChild) maxChild = d;
    }
    return 1 + maxChild;
  };

  const depth = walk(node);
  return { gates, literals, depth, twoInputGateEquiv };
}

function opPrecedence(op: BoolOp): number {
  switch (op) {
    case 'OR':
    case 'NOR':
      return 1;
    case 'XOR':
    case 'XNOR':
      return 2;
    case 'AND':
    case 'NAND':
      return 3;
  }
}

export function varToLatex(name: string): string {
  if (/^[A-Za-z]$/.test(name)) return name;
  const sub = name.match(/^([A-Za-z]+)_?(\d+)$/);
  if (sub) return `${sub[1]}_{${sub[2]}}`;
  return `\\mathrm{${name.replace(/_/g, '\\_')}}`;
}

function needsExplicitAndBetween(left: BoolNode, right: BoolNode): boolean {
  // Always keep separator between constants (e.g. 1 · 0) or adjacent multi-letter names (e.g. Cin · Cout)
  if (left.kind === 'const' || right.kind === 'const') return true;
  if (left.kind === 'var' && left.name.length > 1 && right.kind === 'var') return true;
  if (left.kind === 'var' && right.kind === 'var' && right.name.length > 1) return true;
  return false;
}

export function toLatex(
  node: BoolNode,
  notation: NotationStyle = 'engineering',
  explicitAnd = true,
): string {
  const render = (n: BoolNode, parentPrec: number): string => {
    if (n.kind === 'const') return String(n.value);
    if (n.kind === 'var') return varToLatex(n.name);
    if (n.kind === 'not') {
      if (notation === 'engineering') {
        const inner = render(n.operand, 0);
        return `\\overline{${inner}}`;
      }
      const needsParen = n.operand.kind === 'gate';
      const inner = render(n.operand, 4);
      const sym = notation === 'logic' ? '\\neg ' : notation === 'verilog' ? '\\sim' : '!';
      return needsParen ? `${sym}(${inner})` : `${sym}${inner}`;
    }

    const prec = opPrecedence(n.op);
    if (n.op === 'NAND' || n.op === 'NOR') {
      if (notation === 'engineering') {
        const innerPrec = n.op === 'NAND' ? 3 : 1;
        if (n.op === 'NAND') {
          let joined = '';
          for (let i = 0; i < n.args.length; i++) {
            if (i > 0) {
              const useDot = explicitAnd || needsExplicitAndBetween(n.args[i - 1], n.args[i]);
              joined += useDot ? ' \\cdot ' : '\\,';
            }
            joined += render(n.args[i], innerPrec);
          }
          return `\\overline{${joined}}`;
        }
        const parts = n.args.map((a) => render(a, innerPrec));
        return `\\overline{${parts.join(' + ')}}`;
      }
      const opSym = n.op === 'NAND' ? '\\uparrow ' : '\\downarrow ';
      const parts = n.args.map((a) => render(a, prec + 1));
      const body = parts.join(` ${opSym}`);
      return prec < parentPrec ? `(${body})` : body;
    }

    if (n.op === 'AND' && notation === 'engineering') {
      let body = '';
      for (let i = 0; i < n.args.length; i++) {
        if (i > 0) {
          const useDot = explicitAnd || needsExplicitAndBetween(n.args[i - 1], n.args[i]);
          body += useDot ? ' \\cdot ' : '\\,';
        }
        body += render(n.args[i], prec);
      }
      return prec < parentPrec ? `(${body})` : body;
    }

    let sep = ' + ';
    if (n.op === 'AND') {
      sep =
        notation === 'logic'
          ? ' \\land '
          : notation === 'programming'
            ? ' \\,\\&\\&\\, '
            : ' \\,\\&\\, ';
    } else if (n.op === 'OR') {
      sep =
        notation === 'engineering'
          ? ' + '
          : notation === 'logic'
            ? ' \\lor '
            : notation === 'programming'
              ? ' \\,\\|\\|\\, '
              : ' \\,|\\, ';
    } else if (n.op === 'XOR') {
      sep = ' \\oplus ';
    } else if (n.op === 'XNOR') {
      sep = ' \\odot ';
    }

    const parts = n.args.map((a) => render(a, prec));
    const body = parts.join(sep);
    return prec < parentPrec ? `(${body})` : body;
  };

  return render(node, 0);
}

export function toPlainText(
  node: BoolNode,
  notation: NotationStyle = 'engineering',
  explicitAnd = true,
): string {
  const render = (n: BoolNode, parentPrec: number): string => {
    if (n.kind === 'const') return String(n.value);
    if (n.kind === 'var') return n.name;
    if (n.kind === 'not') {
      if (notation === 'engineering') {
        if (n.operand.kind === 'var' || n.operand.kind === 'const') {
          return `${render(n.operand, 4)}'`;
        }
        return `(${render(n.operand, 0)})'`;
      }
      const prefix = notation === 'logic' ? '¬' : notation === 'verilog' ? '~' : '!';
      if (n.operand.kind === 'gate') {
        return `${prefix}(${render(n.operand, 0)})`;
      }
      return `${prefix}${render(n.operand, 4)}`;
    }

    const prec = opPrecedence(n.op);
    const sepMap: Record<NotationStyle, Record<BoolOp, string>> = {
      engineering: { AND: '·', OR: ' + ', XOR: ' ⊕ ', XNOR: ' ⊙ ', NAND: ' NAND ', NOR: ' NOR ' },
      logic: { AND: ' ∧ ', OR: ' ∨ ', XOR: ' ⊕ ', XNOR: ' ↔ ', NAND: ' ↑ ', NOR: ' ↓ ' },
      programming: { AND: ' && ', OR: ' || ', XOR: ' ^ ', XNOR: ' == ', NAND: ' NAND ', NOR: ' NOR ' },
      verilog: { AND: ' & ', OR: ' | ', XOR: ' ^ ', XNOR: ' ~^ ', NAND: ' NAND ', NOR: ' NOR ' },
    };

    if ((n.op === 'NAND' || n.op === 'NOR') && (notation === 'programming' || notation === 'verilog')) {
      const inner = n.op === 'NAND' ? sepMap[notation].AND : sepMap[notation].OR;
      const notPrefix = notation === 'verilog' ? '~' : '!';
      const body = n.args.map((a) => render(a, prec + 1)).join(inner);
      return `${notPrefix}(${body})`;
    }

    if (n.op === 'AND' && notation === 'engineering') {
      let body = '';
      for (let i = 0; i < n.args.length; i++) {
        if (i > 0) {
          const useDot = explicitAnd || needsExplicitAndBetween(n.args[i - 1], n.args[i]);
          body += useDot ? '·' : '';
        }
        body += render(n.args[i], prec);
      }
      return prec < parentPrec ? `(${body})` : body;
    }

    const sep = sepMap[notation][n.op];
    const parts = n.args.map((a) => render(a, prec));
    const body = parts.join(sep);
    return prec < parentPrec ? `(${body})` : body;
  };

  return render(node, 0);
}

export function toVerilog(outputName: string, node: BoolNode): string {
  const expr = toPlainText(node, 'verilog', true);
  return `assign ${outputName} = ${expr};`;
}

export function toVhdl(outputName: string, node: BoolNode): string {
  const render = (n: BoolNode, parentPrec: number): string => {
    if (n.kind === 'const') return n.value === 1 ? `'1'` : `'0'`;
    if (n.kind === 'var') return n.name;
    if (n.kind === 'not') {
      const inner = render(n.operand, 4);
      return n.operand.kind === 'gate' ? `not (${inner})` : `not ${inner}`;
    }
    const prec = opPrecedence(n.op);
    const opWord = n.op.toLowerCase();
    const parts = n.args.map((a) => render(a, prec + 1));
    const body = parts.join(` ${opWord} `);
    return prec <= parentPrec && parentPrec > 0 ? `(${body})` : body;
  };
  return `${outputName} <= ${render(node, 0)};`;
}
