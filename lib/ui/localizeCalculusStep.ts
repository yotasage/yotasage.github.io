import type { SolutionStep } from '../calculus/types';
import { EXACT_RULE_TITLES, EXACT_STRINGS } from './localizeCalculusStepData';
import type { Locale } from './translations';

function translateRuleTitle(title: string): string {
  if (EXACT_RULE_TITLES[title]) return EXACT_RULE_TITLES[title];
  let m: RegExpMatchArray | null;
  if ((m = title.match(/^Chain rule \+ (.+)$/))) {
    return `Kjerneregel + ${translateRuleTitle(m[1]).toLowerCase()}`;
  }
  if ((m = title.match(/^Derivative of (.+)$/))) {
    return `Derivert av ${m[1]}`;
  }
  if ((m = title.match(/^Higher-order derivative \(order (\d+)\)$/))) {
    return `Høyereordens derivert (orden ${m[1]})`;
  }
  if ((m = title.match(/^Evaluate at (.+) = (.+)$/))) {
    return `Beregn i ${m[1]} = ${m[2]}`;
  }
  if ((m = title.match(/^Integrate with respect to (.+)$/))) {
    return `Integrer med hensyn på ${m[1]}`;
  }
  if ((m = title.match(/^Substitute back (.+) = (.+)$/))) {
    return `Sett tilbake ${m[1]} = ${m[2]}`;
  }
  return title;
}

export function localizeCalculusText(text: string, locale: Locale): string {
  if (locale === 'en' || !text) return text;
  if (EXACT_STRINGS[text]) return EXACT_STRINGS[text];

  let m: RegExpMatchArray | null;
  if ((m = text.match(/^Order (\d+)$/))) return `Orden ${m[1]}`;
  if ((m = text.match(/^(.+) does not depend on (.+)\.$/))) return `${m[1]} avhenger ikke av ${m[2]}.`;
  if ((m = text.match(/^The rate of change of (.+) with respect to itself is 1\.$/))) {
    return `Vekstfarten til ${m[1]} med hensyn på seg selv er 1.`;
  }
  if ((m = text.match(/^Pull the constant factor (.+) outside the derivative\.$/))) {
    return `Trekk konstantfaktoren ${m[1]} utenfor derivasjonen.`;
  }
  if ((m = text.match(/^With u = (.+) and w = (.+)\.$/))) {
    return `Med u = ${m[1]} og w = ${m[2]}.`;
  }
  if ((m = text.match(/^Denominator (.+) is constant with respect to (.+)\.$/))) {
    return `Nevneren ${m[1]} er konstant med hensyn på ${m[2]}.`;
  }
  if ((m = text.match(/^With numerator u = (.+) and denominator w = (.+)\.$/))) {
    return `Med teller u = ${m[1]} og nevner w = ${m[2]}.`;
  }
  if ((m = text.match(/^Bring down exponent n = (.+) and subtract 1 from the exponent\.$/))) {
    return `Trekk ned eksponenten n = ${m[1]} og trekk 1 fra eksponenten.`;
  }
  if ((m = text.match(/^Outer power n = (.+) with inner function u = (.+) and u′ = (.+)\.$/))) {
    return `Ytre potens n = ${m[1]} med indre funksjon u = ${m[2]} og u′ = ${m[3]}.`;
  }
  if ((m = text.match(/^Constant base (.+) raised to variable exponent (.+) \(derivative (.+)\)\.$/))) {
    return `Konstant grunntall ${m[1]} opphøyd i variabel eksponent ${m[2]} (derivert ${m[3]}).`;
  }
  if ((m = text.match(/^Both base u = (.+) and exponent w = (.+) depend on (.+)\.$/))) {
    return `Både grunntallet u = ${m[1]} og eksponenten w = ${m[2]} avhenger av ${m[3]}.`;
  }
  if ((m = text.match(/^Direct elementary derivative with argument (.+)\.$/))) {
    return `Direkte elementær derivert med argument ${m[1]}.`;
  }
  if ((m = text.match(/^Inner function u = (.+) with du\/d(.+) = (.+)\.$/))) {
    return `Indre funksjon u = ${m[1]} med du/d${m[2]} = ${m[3]}.`;
  }
  if ((m = text.match(/^(.+) Because the argument is a composite expression u = (.+), the chain rule multiplies by the inner derivative du\/d(.+)\.$/))) {
    return `${localizeCalculusText(m[1], locale)} Fordi argumentet er et sammensatt uttrykk u = ${m[2]}, ganger kjerneregelen med den indre deriverte du/d${m[3]}.`;
  }
  if ((m = text.match(/^Evaluate the inner derivative du\/d(.+)\.$/))) {
    return `Beregn den indre deriverte du/d${m[1]}.`;
  }
  if ((m = text.match(/^Differentiate with respect to (.+)\.$/))) {
    return `Deriver med hensyn på ${m[1]}.`;
  }
  if ((m = text.match(/^Apply differentiation (\d+) consecutive times with respect to (.+)\.$/))) {
    return `Deriver ${m[1]} ganger etter hverandre med hensyn på ${m[2]}.`;
  }
  if ((m = text.match(/^The derivative measures the instantaneous rate of change \(slope of the tangent line\) of f\((.+)\) as (.+) varies\.$/))) {
    return `Den deriverte måler den momentane vekstfarten (stigningstallet til tangentlinjen) til f(${m[1]}) når ${m[2]} varierer.`;
  }
  if ((m = text.match(/^Simplified first derivative with respect to (.+)\.$/))) {
    return `Forenklet førstederivert med hensyn på ${m[1]}.`;
  }
  if ((m = text.match(/^Simplified order-(\d+) derivative with respect to (.+)\.$/))) {
    return `Forenklet ${m[1]}.-ordens derivert med hensyn på ${m[2]}.`;
  }
  if ((m = text.match(/^Tangent line at (.+) = (.+): (.+)\.$/))) {
    return `Tangentlinje i ${m[1]} = ${m[2]}: ${m[3]}.`;
  }
  if ((m = text.match(/^Substitute (.+) = (.+) into the derivative\.$/))) {
    return `Sett ${m[1]} = ${m[2]} inn i den deriverte.`;
  }
  if ((m = text.match(/^At (.+) = (.+), the curve passes through \((.+), (.+)\) with slope (.+), so the local linear approximation is y = f\(a\) \+ f′\(a\)\((.+) − a\)\.$/))) {
    return `Ved ${m[1]} = ${m[2]} går kurven gjennom (${m[3]}, ${m[4]}) med stigningstall ${m[5]}, slik at den lokale lineære tilnærmingen er y = f(a) + f′(a)(${m[6]} − a).`;
  }
  if ((m = text.match(/^(.+) is constant with respect to (.+)\.$/))) {
    return `${m[1]} er konstant med hensyn på ${m[2]}.`;
  }
  if ((m = text.match(/^Factor constant (.+) outside the integral\.$/))) {
    return `Trekk konstanten ${m[1]} utenfor integralet.`;
  }
  if ((m = text.match(/^Denominator (.+) is constant\.$/))) {
    return `Nevneren ${m[1]} er konstant.`;
  }
  if ((m = text.match(/^Linear substitution u = (.+), du = (.+) d(.+)\.$/))) {
    return `Lineær substitusjon u = ${m[1]}, du = ${m[2]} d${m[3]}.`;
  }
  if ((m = text.match(/^Rewrite (sin²|cos²)\((.+)\) in terms of cos\((.+)\)\.$/))) {
    return `Skriv om ${m[1]}(${m[2]}) uttrykt ved cos(${m[3]}).`;
  }
  if ((m = text.match(/^Split off one (sin|cos) factor and convert the remaining (sin|cos)² using 1 − (sin|cos)²\.$/))) {
    return `Skill ut én ${m[1]}-faktor og gjør om den gjenværende ${m[2]}² med 1 − ${m[3]}².`;
  }
  if ((m = text.match(/^Increase exponent from (.+) to (.+) and divide by (.+)\.$/))) {
    return `Øk eksponenten fra ${m[1]} til ${m[2]} og del på ${m[3]}.`;
  }
  if ((m = text.match(/^Let u = (.+), du = (.+) d(.+); apply power rule with n = (.+)\.$/))) {
    return `La u = ${m[1]}, du = ${m[2]} d${m[3]}; bruk potensregelen med n = ${m[4]}.`;
  }
  if ((m = text.match(/^With linear substitution u = (.+), du = (.+) d(.+)\.$/))) {
    return `Med lineær substitusjon u = ${m[1]}, du = ${m[2]} d${m[3]}.`;
  }
  if ((m = text.match(/^Substitute u = (.+) to reduce the integrand to a standard form\.$/))) {
    return `Sett u = ${m[1]} for å redusere integranden til en standardform.`;
  }
  if ((m = text.match(/^Standard antiderivative of (.+)\.$/))) {
    return `Standard antiderivert av ${m[1]}.`;
  }
  if ((m = text.match(/^Integrate in u and substitute back u = (.+)\.$/))) {
    return `Integrer med hensyn på u og sett tilbake u = ${m[1]}.`;
  }
  if ((m = text.match(/^Find an antiderivative F\((.+)\) and evaluate F\(b\) − F\(a\) on \[(.+), (.+)\]\.$/))) {
    return `Finn en antiderivert F(${m[1]}) og beregn F(b) − F(a) på [${m[2]}, ${m[3]}].`;
  }
  if ((m = text.match(/^Find the general family of antiderivatives F\((.+)\) \+ C with respect to (.+)\.$/))) {
    return `Finn den generelle familien av antideriverte F(${m[1]}) + C med hensyn på ${m[2]}.`;
  }
  if ((m = text.match(/^Evaluate F\((.+)\) − F\((.+)\)\.$/))) {
    return `Beregn F(${m[1]}) − F(${m[2]}).`;
  }
  if ((m = text.match(/^Exact symbolic result with numeric value (.+)\.$/))) {
    return `Eksakt symbolsk resultat med numerisk verdi ${m[1]}.`;
  }
  if ((m = text.match(/^Estimated integration error ≤ (.+) on \[(.+), (.+)\]\.$/))) {
    return `Estimert integrasjonsfeil ≤ ${m[1]} på [${m[2]}, ${m[3]}].`;
  }
  if ((m = text.match(/^Adaptive Gauss–Kronrod quadrature \(est\. error (.+)\)\.$/))) {
    return `Adaptiv Gauss–Kronrod-kvadratur (est. feil ${m[1]}).`;
  }
  if ((m = text.match(/^Choose (.+) = (.+) because its derivative (.+) cancels the remaining (.+)-factor\.$/))) {
    return `Velg ${m[1]} = ${m[2]} fordi den deriverte ${m[3]} forkorter den gjenværende ${m[4]}-faktoren.`;
  }
  if ((m = text.match(/^Rewrite the integral purely in (.+) and find its antiderivative\.$/))) {
    return `Skriv om integralet rent i ${m[1]} og finn den antideriverte.`;
  }
  if ((m = text.match(/^Replace (.+) with (.+) to express the antiderivative in terms of (.+)\.$/))) {
    return `Bytt ut ${m[1]} med ${m[2]} for å uttrykke den antideriverte i ${m[3]}.`;
  }
  if ((m = text.match(/^Match a = (.+) and u = (.+)\.$/))) {
    return `Tilpass med a = ${m[1]} og u = ${m[2]}.`;
  }
  if ((m = text.match(/^With u = (.+) and k = (.+)\.$/))) {
    return `Med u = ${m[1]} og k = ${m[2]}.`;
  }
  if ((m = text.match(/^Factor denominator using real roots (.+)₁ = (.+), (.+)₂ = (.+)\.$/))) {
    return `Faktoriser nevneren med de reelle røttene ${m[1]}₁ = ${m[2]}, ${m[3]}₂ = ${m[4]}.`;
  }
  if ((m = text.match(/^Repeated root at (.+) = (.+)\.$/))) {
    return `Dobbel rot ved ${m[1]} = ${m[2]}.`;
  }
  if ((m = text.match(/^Apply IBP twice with u = (.+) and dv = (.+) d(.+)\.$/))) {
    return `Bruk delvis integrasjon to ganger med u = ${m[1]} og dv = ${m[2]} d${m[3]}.`;
  }
  if ((m = text.match(/^Move the repeated integral term to the left and divide by a² \+ b² = (.+)\.$/))) {
    return `Flytt det gjentatte integralleddet over til venstre side og del på a² + b² = ${m[1]}.`;
  }
  if ((m = text.match(/^Choose u = (.+) \(Logarithmic\) and dv = (.+) d(.+) \(Algebraic\)\.$/))) {
    return `Velg u = ${m[1]} (logaritmisk) og dv = ${m[2]} d${m[3]} (algebraisk).`;
  }
  if ((m = text.match(/^Choose u = (.+) so differentiating drops its polynomial degree by 1\.$/))) {
    return `Velg u = ${m[1]} slik at derivasjon senker polynomgraden med 1.`;
  }
  if ((m = text.match(/^Invalid (differentiation|integration) variable "(.+)"\. Use a letter such as x, t, or theta\.$/))) {
    const kind = m[1] === 'differentiation' ? 'derivasjonsvariabel' : 'integrasjonsvariabel';
    return `Ugyldig ${kind} «${m[2]}». Bruk en bokstav som x, t eller theta.`;
  }
  if ((m = text.match(/^Examples: (.+)$/))) {
    return `Eksempler: ${m[1]}`;
  }
  if ((m = text.match(/^Invalid bound: (.+)$/))) {
    return `Ugyldig grense: ${m[1]}`;
  }
  if ((m = text.match(/^Unsupported function "(.+)" in differentiation\.$/))) {
    return `Funksjonen «${m[1]}» støttes ikke ved derivasjon.`;
  }
  return text;
}

export function localizeCalculusStep(step: SolutionStep, locale: Locale): SolutionStep {
  if (locale === 'en') return step;
  return {
    ...step,
    workLabel: step.workLabel ? localizeCalculusText(step.workLabel, locale) : undefined,
    ruleTitle: translateRuleTitle(step.ruleTitle),
    annotation: step.annotation ? localizeCalculusText(step.annotation, locale) : undefined,
    theory: step.theory ? localizeCalculusText(step.theory, locale) : undefined,
  };
}
