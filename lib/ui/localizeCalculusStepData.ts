export const EXACT_RULE_TITLES: Record<string, string> = {
  // Differentiate
  'Problem statement': 'Oppgave',
  'Final derivative': 'Endelig derivert',
  'Constant rule': 'Konstantregel',
  'Identity (variable) rule': 'Identitetsregel (variabel)',
  'Constant multiple rule': 'Konstantfaktorregel',
  'Sum rule (linearity)': 'Sumregel (linearitet)',
  'Difference rule (linearity)': 'Differanseregel (linearitet)',
  'Product rule': 'Produktregel',
  'Differentiate factors': 'Deriver faktorene',
  'Substitute into product rule': 'Sett inn i produktregelen',
  'Quotient rule': 'Brøkregel',
  'Evaluate numerator & denominator derivatives': 'Beregn den deriverte av teller og nevner',
  'Power rule': 'Potensregel',
  'Generalized power rule (chain rule)': 'Generalisert potensregel (kjerneregel)',
  'Exponential & chain rule': 'Eksponential- og kjerneregel',
  'General exponential rule': 'Generell eksponentialregel',
  'Logarithmic differentiation': 'Logaritmisk derivasjon',
  'Differentiate inner function': 'Deriver den indre funksjonen',
  'Algebraic simplification': 'Algebraisk forenkling',
  'Derivative of sine': 'Derivert av sinus',
  'Derivative of cosine': 'Derivert av cosinus',
  'Derivative of tangent': 'Derivert av tangens',
  'Derivative of secant': 'Derivert av sekans',
  'Derivative of cosecant': 'Derivert av kosekans',
  'Derivative of cotangent': 'Derivert av cotangens',
  'Derivative of arcsine': 'Derivert av arcsin',
  'Derivative of arccosine': 'Derivert av arccos',
  'Derivative of arctangent': 'Derivert av arctan',
  'Derivative of hyperbolic sine': 'Derivert av hyperbolsk sinus',
  'Derivative of hyperbolic cosine': 'Derivert av hyperbolsk cosinus',
  'Derivative of hyperbolic tangent': 'Derivert av hyperbolsk tangens',
  'Exponential rule': 'Eksponentialregel',
  'Natural logarithm rule': 'Regel for naturlig logaritme',
  'Base-10 logarithm rule': 'Regel for 10-er-logaritme',
  'Base-2 logarithm rule': 'Regel for 2-er-logaritme',
  'Square-root rule (power rule with n = 1/2)': 'Kvadratrotregel (potensregel med n = 1/2)',
  'Cube-root rule (power rule with n = 1/3)': 'Kubikkrotregel (potensregel med n = 1/3)',
  'Absolute value derivative': 'Derivert av absoluttverdi',

  // Integrate
  'Definite integral setup': 'Oppsett for bestemt integral',
  'Indefinite integral setup': 'Oppsett for ubestemt integral',
  'Add constant of integration (+ C)': 'Legg til integrasjonskonstant (+ C)',
  'Fundamental Theorem of Calculus': 'Analysens fundamentalteorem',
  'Final definite integral': 'Endelig bestemt integral',
  'Non-elementary antiderivative': 'Ikke-elementær antiderivert',
  'Adaptive Gauss–Kronrod G7–K15 quadrature': 'Adaptiv Gauss–Kronrod G7–K15-kvadratur',
  'Algebraic expansion': 'Algebraisk utvidelse',
  'Split fraction numerator': 'Del opp brøkens teller',
  'Quotient of powers identity': 'Potensbrøk-identitet',
  'Integral of sec²': 'Integral av sec²',
  'Integral of csc²': 'Integral av csc²',
  'Power-reduction identity (half-angle)': 'Potensreduksjonsidentitet (halvvinkel)',
  'Pythagorean identity for tangent': 'Pytagoreisk identitet for tangens',
  'Pythagorean identity (odd trig power)': 'Pytagoreisk identitet (odde trig-potens)',
  'Logarithmic integral (n = −1 case)': 'Logaritmisk integral (tilfellet n = −1)',
  'Linear u-substitution + power rule': 'Lineær u-substitusjon + potensregel',
  'Binomial expansion': 'Binomialutvidelse',
  'Exponential integral': 'Eksponentialintegral',
  'General exponential integral': 'Generelt eksponentialintegral',
  'Linear u-sub + exponential rule': 'Lineær u-substitusjon + eksponentialregel',
  'Integral of sine': 'Integral av sinus',
  'Linear u-sub + integral of sine': 'Lineær u-substitusjon + integral av sinus',
  'Integral of cosine': 'Integral av cosinus',
  'Linear u-sub + integral of cosine': 'Lineær u-substitusjon + integral av cosinus',
  'Integral of tangent (via u = cos)': 'Integral av tangens (via u = cos)',
  'Integral of cotangent': 'Integral av cotangens',
  'Integral of secant': 'Integral av sekans',
  'Integral of hyperbolic sine': 'Integral av hyperbolsk sinus',
  'Integral of hyperbolic cosine': 'Integral av hyperbolsk cosinus',
  'Integral of hyperbolic tangent': 'Integral av hyperbolsk tangens',
  'Integral of natural logarithm (by parts)': 'Integral av naturlig logaritme (delvis integrasjon)',
  'Integral of arctangent (by parts)': 'Integral av arctan (delvis integrasjon)',
  'Integral of arcsine (by parts)': 'Integral av arcsin (delvis integrasjon)',
  'Integral of arccosine (by parts)': 'Integral av arccos (delvis integrasjon)',
  'Square-root power rule': 'Potensregel for kvadratrot',
  'Linear substitution': 'Lineær substitusjon',
  'u-Substitution': 'u-substitusjon',
  'Product-to-sum trigonometric identity': 'Produkt-til-sum trigonometrisk identitet',
  'Logarithmic reciprocal integral': 'Logaritmisk resiprokt integral',
  'Negative exponent rewrite': 'Omskriving med negativ eksponent',
  'Reciprocal identity (1/cos² = sec²)': 'Resiprok identitet (1/cos² = sec²)',
  'Reciprocal identity (1/sin² = csc²)': 'Resiprok identitet (1/sin² = csc²)',
  'Inverse sine integral form': 'Integralform for invers sinus',
  'Inverse hyperbolic sine form': 'Integralform for invers hyperbolsk sinus',
  'Complete the square': 'Fullstendig kvadrat',
  'Arctangent integral form': 'Integralform for arctan',
  'Partial fraction decomposition': 'Delbrøkoppspalting',
  'Integrate each partial fraction': 'Integrer hver delbrøk',
  'Perfect square factorization': 'Faktorisering som fullstendig kvadrat',
  'Power rule (n = −2)': 'Potensregel (n = −2)',
  'Cyclic integration by parts (apply twice)': 'Syklisk delvis integrasjon (brukes to ganger)',
  'Solve algebraically for I': 'Løs algebraisk for I',
  'Integration by parts (LIATE: L before A)': 'Delvis integrasjon (LIATE: L før A)',
  'Apply uv − ∫ v du and integrate remainder': 'Bruk uv − ∫ v du og integrer resten',
  'Integration by parts (LIATE: A before T/E)': 'Delvis integrasjon (LIATE: A før T/E)',
  'Apply uv − ∫ v du': 'Bruk uv − ∫ v du',
};

export const EXACT_STRINGS: Record<string, string> = {
  // Annotations
  'Factor out the negative sign before differentiating.': 'Faktoriser ut minustegnet før derivasjon.',
  'Differentiate each additive term independently.': 'Deriver hvert additivt ledd hver for seg.',
  'Compute the derivative of each factor separately, then substitute back into u′w + uw′.':
    'Beregn den deriverte av hver faktor for seg, og sett tilbake i u′w + uw′.',
  'Insert u′ and w′ into u′w + uw′.': 'Sett inn u′ og w′ i u′w + uw′.',
  'Substitute u′ and w′ into (u′w − uw′)/w².': 'Sett inn u′ og w′ i (u′w − uw′)/w².',
  'Combine like terms, fold constant factors, and reduce fractions or exponents.':
    'Slå sammen like ledd, forenkle konstantfaktorer og forkort brøker og eksponenter.',
  'Apply the power rule with n = 1.': 'Bruk potensregelen med n = 1.',
  'Factor out the negative sign.': 'Faktoriser ut minustegnet.',
  'Split the integral term by term.': 'Del opp integralet ledd for ledd.',
  'Expand the product into a sum of elementary terms.': 'Utvid produktet til en sum av elementære ledd.',
  'Divide each numerator term separately by the denominator.': 'Del hvert ledd i telleren med nevneren hver for seg.',
  'Combine powers of the same base before applying the power rule.':
    'Slå sammen potenser med samme grunntall før potensregelen brukes.',
  'Direct antiderivative of sec².': 'Direkte antiderivert av sec².',
  'Reverse of d/du[cot(u)] = −csc²(u).': 'Omvendt av d/du[cot(u)] = −csc²(u).',
  'Replace tan² with sec² − 1, since ∫ sec²(u) du = tan(u).':
    'Bytt ut tan² med sec² − 1, siden ∫ sec²(u) du = tan(u).',
  'The power rule fails at n = −1; the antiderivative is ln|x|.':
    'Potensregelen gjelder ikke for n = −1; den antideriverte er ln|x|.',
  'Expand the power into individual polynomial terms.': 'Utvid potensen til enkelte polynomledd.',
  'Apply exponential antiderivative directly.': 'Bruk den eksponentielle antideriverte direkte.',
  'General antiderivative verified by differentiation.': 'Generell antiderivert verifisert ved derivasjon.',
  'Exact symbolic result.': 'Eksakt symbolsk resultat.',
  'No closed-form elementary antiderivative matched this integrand; switching to adaptive numerical quadrature.':
    'Ingen lukket elementær antiderivert passet for integranden; bytter til adaptiv numerisk kvadratur.',
  'Convert the trig product into a sum of single trig functions.':
    'Gjør om det trigonometriske produktet til en sum av enkle trigonometriske funksjoner.',
  'Apply ∫ (1/u) du = ln|u|.': 'Bruk ∫ (1/u) du = ln|u|.',
  'Rewrite reciprocal power with a negative exponent to apply the power rule.':
    'Skriv om den resiproke potensen med negativ eksponent for å bruke potensregelen.',
  'Convert 1/cos² to sec² and integrate.': 'Skriv om 1/cos² til sec² og integrer.',
  'Convert 1/sin² to csc² and integrate.': 'Skriv om 1/sin² til csc² og integrer.',
  'Rewrite the irreducible quadratic as a sum of squares.':
    'Skriv om det irredusible andregradsuttrykket som en sum av kvadrater.',
  'Apply the logarithmic integral to each linear term.':
    'Bruk det logaritmiske integralet på hvert lineære ledd.',
  'Integrate (x − r)⁻² using the power rule.': 'Integrer (x − r)⁻² med potensregelen.',
  'Recognize the sum-of-squares denominator pattern.': 'Gjenkjenn mønsteret med sum av kvadrater i nevneren.',
  'The remaining integral reduces to a single power term.': 'Det gjenværende integralet reduseres til ett enkelt potensledd.',
  'Substitute u, v, and du into the integration-by-parts formula.':
    'Sett u, v og du inn i formelen for delvis integrasjon.',

  // Theories
  'Because sin(x) measures vertical height on the unit circle, its instantaneous rate of change equals the horizontal coordinate cos(x).':
    'Siden sin(x) måler vertikal høyde på enhetssirkelen, er den momentane vekstfarten lik den horisontale koordinaten cos(x).',
  'Cosine starts at its peak at u = 0 and decreases as u increases into the first quadrant, giving a negative slope −sin(u).':
    'Cosinus starter på topp ved u = 0 og avtar når u øker inn i første kvadrant, noe som gir negativ stigning −sin(u).',
  'Follows from writing tan(u) = sin(u)/cos(u), applying the quotient rule, and simplifying sin²(u) + cos²(u) = 1.':
    'Følger av å skrive tan(u) = sin(u)/cos(u), bruke brøkregelen og forenkle med sin²(u) + cos²(u) = 1.',
  'Derived by rewriting sec(u) = (cos u)⁻¹ and applying the power and chain rules.':
    'Utledes ved å skrive sec(u) = (cos u)⁻¹ og bruke potens- og kjerneregelen.',
  'Derived by rewriting csc(u) = (sin u)⁻¹ and applying the power and chain rules.':
    'Utledes ved å skrive csc(u) = (sin u)⁻¹ og bruke potens- og kjerneregelen.',
  'Follows from cot(u) = cos(u)/sin(u) via the quotient rule and sin²(u) + cos²(u) = 1.':
    'Følger av cot(u) = cos(u)/sin(u) via brøkregelen og sin²(u) + cos²(u) = 1.',
  'Obtained by implicit differentiation of sin(y) = u, giving cos(y) y′ = 1 and substituting cos(y) = √(1 − u²) for y ∈ (−π/2, π/2).':
    'Fås ved implisitt derivasjon av sin(y) = u, som gir cos(y) y′ = 1 og innsetting av cos(y) = √(1 − u²) for y ∈ (−π/2, π/2).',
  'Since arccos(u) = π/2 − arcsin(u), its derivative is simply the negative of the derivative of arcsin(u).':
    'Siden arccos(u) = π/2 − arcsin(u), er den deriverte rett og slett det negative av den deriverte til arcsin(u).',
  'Implicitly differentiating tan(y) = u yields sec²(y) y′ = 1; replacing sec²(y) = 1 + tan²(y) = 1 + u² produces 1/(1 + u²).':
    'Implisitt derivasjon av tan(y) = u gir sec²(y) y′ = 1; ved å erstatte sec²(y) = 1 + tan²(y) = 1 + u² får vi 1/(1 + u²).',
  'From sinh(u) = (eᵘ − e⁻ᵘ)/2, differentiating term by term gives (eᵘ + e⁻ᵘ)/2 = cosh(u).':
    'Fra sinh(u) = (eᵘ − e⁻ᵘ)/2 gir leddvis derivasjon (eᵘ + e⁻ᵘ)/2 = cosh(u).',
  'Unlike circular cosine, hyperbolic cosine has a positive derivative: d/du[(eᵘ + e⁻ᵘ)/2] = (eᵘ − e⁻ᵘ)/2 = sinh(u).':
    'I motsetning til vanlig cosinus har hyperbolsk cosinus positiv derivert: d/du[(eᵘ + e⁻ᵘ)/2] = (eᵘ − e⁻ᵘ)/2 = sinh(u).',
  'Applying the quotient rule to sinh(u)/cosh(u) and using cosh²(u) − sinh²(u) = 1 gives sech²(u).':
    'Bruk av brøkregelen på sinh(u)/cosh(u) sammen med cosh²(u) − sinh²(u) = 1 gir sech²(u).',
  'The natural base e is uniquely defined so that the slope of eᵘ at every point equals its own height eᵘ.':
    'Grunntallet e er unikt definert slik at stigningstallet til eᵘ i hvert punkt er lik funksjonsverdien eᵘ.',
  'Since ln(u) is the inverse of eʸ, differentiating eʸ = u gives eʸ y′ = 1, hence y′ = 1/u (valid for u > 0).':
    'Siden ln(u) er den inverse av eʸ, gir derivasjon av eʸ = u at eʸ y′ = 1, altså y′ = 1/u (gyldig for u > 0).',
  'Rewrite using change of base: log₁₀(u) = ln(u) / ln(10), then apply the natural logarithm rule.':
    'Skriv om med grunntallskifte: log₁₀(u) = ln(u) / ln(10), og bruk deretter regelen for naturlig logaritme.',
  'Rewrite using change of base: log₂(u) = ln(u) / ln(2), then differentiate ln(u).':
    'Skriv om med grunntallskifte: log₂(u) = ln(u) / ln(2), og deriver deretter ln(u).',
  'Rewrite √u as u^(1/2) and apply the power rule: (1/2)u^(-1/2) = 1/(2√u).':
    'Skriv √u som u^(1/2) og bruk potensregelen: (1/2)u^(-1/2) = 1/(2√u).',
  'Rewrite ∛u as u^(1/3) and apply the power rule: (1/3)u^(-2/3).':
    'Skriv ∛u som u^(1/3) og bruk potensregelen: (1/3)u^(-2/3).',
  'Writing |u| = √(u²) and differentiating via the chain rule yields u/|u| = sgn(u) wherever u ≠ 0.':
    'Ved å skrive |u| = √(u²) og derivere med kjerneregelen får vi u/|u| = sgn(u) for u ≠ 0.',
  'Apply the standard elementary derivative together with the chain rule for composite arguments.':
    'Bruk standard derivasjonsregel sammen med kjerneregelen for sammensatte uttrykk.',
  'A constant function has a flat horizontal graph, so its instantaneous rate of change is identically zero everywhere.':
    'En konstant funksjon har en vannrett graf, så den momentane vekstfarten er identisk lik null overalt.',
  'The line y = x rises by 1 unit vertically for every 1 unit moved horizontally, giving constant slope 1.':
    'Linjen y = x stiger med 1 enhet vertikalt for hver enhet horisontalt, og har konstant stigningstall 1.',
  'Negating a function reflects its graph across the horizontal axis, which negates every tangent slope.':
    'Å skifte fortegn på en funksjon speiler grafen om den horisontale aksen, noe som skifter fortegn på alle tangentstigninger.',
  'Differentiation is a linear operator: adding or subtracting functions adds or subtracts their instantaneous rates of change.':
    'Derivasjon er en lineær operator: å legge sammen eller trekke fra funksjoner legger sammen eller trekker fra vekstfartene deres.',
  'Vertically stretching a curve by a constant factor c stretches every tangent slope by the exact same factor c.':
    'Å strekke en kurve vertikalt med en konstant faktor c strekker hver tangentstigning med nøyaktig samme faktor c.',
  'Imagine a rectangle with side lengths u(x) and w(x): when x grows slightly, the area increases by two strips u′w and uw′, while the corner u′w′ vanishes in the limit.':
    'Tenk deg et rektangel med sidelengder u(x) og w(x): når x øker litt, øker arealet med to strimler u′w og uw′, mens hjørnet u′w′ forsvinner i grensen.',
  'Breaking a product into u′ and w′ isolates each smaller rule (power, chain, trig, etc.) before recombining.':
    'Å dele et produkt i u′ og w′ isolerer hver mindre regel (potens, kjerne, trig osv.) før leddene settes sammen igjen.',
  'Dividing by a constant c is the same as multiplying by 1/c, so it passes straight through the derivative.':
    'Å dele på en konstant c er det samme som å gange med 1/c, så den går rett utenfor derivasjonen.',
  'The quotient rule is a special case of the product rule applied to u · w⁻¹. Notice the minus sign: order matters — differentiate the numerator first.':
    'Brøkregelen er et spesialtilfelle av produktregelen brukt på u · w⁻¹. Merk minustegnet: rekkefølgen er viktig — deriver telleren først.',
  'Works for every real constant exponent n (positive integers, negative powers, and fractional roots alike).':
    'Gjelder for enhver reell konstant eksponent n (positive heltall, negative potenser og brøkpotenser).',
  'Differentiate the outer power first while keeping the inner expression u untouched, then multiply by the derivative of the inner expression u′.':
    'Deriver den ytre potensen først mens det indre uttrykket u står urørt, og gang deretter med den deriverte av det indre uttrykket u′.',
  'Write aᵘ = e^(u ln a). The chain rule brings down ln(a) · u′ while keeping aᵘ unchanged.':
    'Skriv aᵘ = e^(u ln a). Kjerneregelen trekker ned ln(a) · u′ mens aᵘ forblir uendret.',
  'Neither the power rule nor the exponential rule alone applies when both base and exponent vary. Taking ln(y) turns the power into a product w·ln(u), which differentiates cleanly via the product rule.':
    'Verken potensregelen eller eksponentialregelen alene gjelder når både grunntall og eksponent varierer. Å ta ln(y) gjør potensen om til produktet w·ln(u), som deriveres med produktregelen.',
  'Simplifying after applying calculus rules makes the result easier to evaluate, factor, or differentiate again.':
    'Forenkling etter derivasjon gjør resultatet enklere å beregne, faktorisere eller derivere videre.',
  'Each higher-order derivative differentiates the previous derivative: f′ gives slope, f″ gives concavity/acceleration, and higher orders describe higher rates of change.':
    'Hver høyereordens derivert deriverer den forrige: f′ gir stigning, f″ gir krumning/akselerasjon, og høyere ordener beskriver høyere endringsrater.',
  'Evaluating the derivative at a specific point turns the symbolic rate-of-change formula into a concrete numeric value.':
    'Å beregne den deriverte i et bestemt punkt gjør den symbolske formelen om til en konkret tallverdi.',
  'Integrating a constant c accumulates a rectangle of height c over width x, giving c·x.':
    'Å integrere en konstant c bygger opp et rektangel med høyde c over bredde x, som gir c·x.',
  'Raising the exponent from 1 to 2 and dividing by 2 reverses the differentiation power rule d/dx(x²/2) = x.':
    'Å øke eksponenten fra 1 til 2 og dele på 2 er det omvendte av potensregelen for derivasjon: d/dx(x²/2) = x.',
  'Integration is linear: the signed area under a sum or difference of curves equals the sum or difference of their individual areas.':
    'Integrasjon er lineær: det signerte arealet under en sum eller differanse av kurver er lik summen eller differansen av enkeltarealene.',
  'Unlike derivatives, there is no simple product rule for integrals; expanding algebraic products turns them into easy term-by-term power integrals.':
    'I motsetning til derivasjon finnes det ingen enkel produktregel for integraler; ved å utvide produkter får vi enkle potensintegraler ledd for ledd.',
  'Because d/du[tan(u)] = sec²(u), integrating sec²(u) returns tan(u) immediately.':
    'Siden d/du[tan(u)] = sec²(u), gir integrasjon av sec²(u) direkte tan(u).',
  'Even powers of sine cannot use a direct u-substitution without a cosine factor. The power-reduction identity drops the degree from 2 to 1 so it integrates directly.':
    'Partallspotenser av sinus kan ikke løses med direkte u-substitusjon uten en cosinusfaktor. Potensreduksjon senker graden fra 2 til 1 slik at uttrykket kan integreres direkte.',
  'Reducing cos²(θ) via the double-angle formula eliminates the square and produces a standard cosine integral.':
    'Å redusere cos²(θ) med dobbelvinkelformelen fjerner kvadratet og gir et standard cosinusintegral.',
  'Converting tan² into sec² − 1 unlocks the exact antiderivative tan(u) − u.':
    'Å skrive om tan² til sec² − 1 gir direkte den eksakte antideriverte tan(u) − u.',
  'For odd powers of sine or cosine, peeling off one factor leaves an even power convertible via sin² + cos² = 1, setting up a clean u-substitution.':
    'For oddetallspotenser av sinus eller cosinus gir det å skille ut én faktor en partallspotens som kan omformes med sin² + cos² = 1 til en ren u-substitusjon.',
  'The absolute value |u| ensures the antiderivative is valid on both the positive and negative halves of the domain.':
    'Absoluttverdien |u| sikrer at den antideriverte er gyldig på både positiv og negativ side av definisjonsmengden.',
  'Each power term integrates by raising the power by 1 and dividing by the new exponent.':
    'Hvert potensledd integreres ved å øke eksponenten med 1 og dele på den nye eksponenten.',
  'When the inner expression is linear (ax + b), substituting u = ax + b simply divides the standard antiderivative by the slope a.':
    'Når det indre uttrykket er lineært (ax + b), deler substitusjonen u = ax + b standard-antideriverte på stigningstallet a.',
  'Because differentiating aᵘ multiplies by ln(a), integrating divides by ln(a).':
    'Siden derivasjon av aᵘ ganger med ln(a), deler integrasjon på ln(a).',
  'The exponential function eᵘ is its own derivative, so it is also its own antiderivative (scaled by 1/a for linear arguments ax + b).':
    'Eksponentialfunksjonen eᵘ er sin egen derivert, og dermed også sin egen antiderivert (skalert med 1/a for lineære argumenter ax + b).',
  'Watch the minus sign: d/du[cos(u)] = −sin(u), so an extra minus sign is needed to recover +sin(u).':
    'Pass på minustegnet: d/du[cos(u)] = −sin(u), så et ekstra minustegn trengs for å få tilbake +sin(u).',
  'Direct inverse of d/du[sin(u)] = cos(u).': 'Direkte omvendt av d/du[sin(u)] = cos(u).',
  'Write tan(u) = sin(u)/cos(u) and substitute w = cos(u), dw = −sin(u) du to obtain −∫ dw/w = −ln|cos(u)|.':
    'Skriv tan(u) = sin(u)/cos(u) og sett w = cos(u), dw = −sin(u) du for å få −∫ dw/w = −ln|cos(u)|.',
  'Write cot(u) = cos(u)/sin(u) and substitute w = sin(u), dw = cos(u) du.':
    'Skriv cot(u) = cos(u)/sin(u) og sett w = sin(u), dw = cos(u) du.',
  'Multiplying numerator and denominator by (sec u + tan u) makes the numerator the exact derivative of the denominator.':
    'Ved å utvide brøken med (sec u + tan u) blir telleren nøyaktig den deriverte av nevneren.',
  'Hyperbolic sine and cosine differentiate into each other with no sign flip.':
    'Hyperbolsk sinus og cosinus deriveres til hverandre uten fortegnskifte.',
  'Direct inverse of d/du[sinh(u)] = cosh(u).': 'Direkte omvendt av d/du[sinh(u)] = cosh(u).',
  'Write tanh(u) = sinh(u)/cosh(u) and let w = cosh(u) (always positive).':
    'Skriv tanh(u) = sinh(u)/cosh(u) og la w = cosh(u) (alltid positiv).',
  'Apply integration by parts with p = ln(u) and dq = du, so dp = (1/u) du and q = u, leaving u·ln(u) − ∫ 1 du.':
    'Bruk delvis integrasjon med p = ln(u) og dq = du, slik at dp = (1/u) du og q = u, som gir u·ln(u) − ∫ 1 du.',
  'Choose p = arctan(u), dq = du by LIATE; the remaining integral ∫ u/(1 + u²) du evaluates via w = 1 + u².':
    'Velg p = arctan(u), dq = du etter LIATE; det gjenværende integralet ∫ u/(1 + u²) du løses med w = 1 + u².',
  'Choose p = arcsin(u), dq = du by LIATE; the remaining integral ∫ u/√(1 − u²) du solves via w = 1 − u².':
    'Velg p = arcsin(u), dq = du etter LIATE; det gjenværende integralet ∫ u/√(1 − u²) du løses med w = 1 − u².',
  'Apply integration by parts with p = arccos(u) and dq = du.':
    'Bruk delvis integrasjon med p = arccos(u) og dq = du.',
  'Rewrite √u as u^(1/2) and apply the power rule with n = 1/2: dividing by 3/2 multiplies by 2/3.':
    'Skriv √u som u^(1/2) og bruk potensregelen med n = 1/2: å dele på 3/2 tilsvarer å gange med 2/3.',
  'A linear change of variable u = ax + b scales the differential by a constant factor 1/a.':
    'Et lineært variabelskifte u = ax + b skalerer differensialet med konstantfaktoren 1/a.',
  'By the Fundamental Theorem of Calculus, the signed net area under a continuous curve from a to b equals the net change F(b) − F(a) of any antiderivative F.':
    'Etter analysens fundamentalteorem er det signerte nettoarealet under en kontinuerlig kurve fra a til b lik nettoendringen F(b) − F(a) for enhver antiderivert F.',
  'An indefinite integral finds all functions F whose derivative equals the integrand. Because the derivative of any constant is zero, we always add + C.':
    'Et ubestemt integral finner alle funksjoner F som har integranden som derivert. Siden den deriverte av enhver konstant er null, legger vi alltid til + C.',
  'Adding + C represents the entire vertical family of antiderivatives that share the same slope f(x) at every x.':
    'Tillegget + C representerer hele den vertikale familien av antideriverte som har samme stigning f(x) i hvert punkt x.',
  'The constant + C cancels out in F(b) − F(a), leaving the exact signed area between the curve and the horizontal axis on [a, b].':
    'Konstanten + C faller bort i F(b) − F(a), og står igjen med det eksakte signerte arealet mellom kurven og den horisontale aksen på [a, b].',
  'Many important functions (such as e^(−x²) or sin(x)/x) have provably non-elementary antiderivatives, yet their definite integrals can be computed to machine precision via numerical quadrature.':
    'Mange viktige funksjoner (som e^(−x²) eller sin(x)/x) har beviselig ingen elementær antiderivert, men de bestemte integralene kan beregnes til maskinpresisjon med numerisk kvadratur.',
  'Gauss–Kronrod quadrature compares a 7-point Gauss rule against a nested 15-point Kronrod rule on each subinterval and automatically subdivides wherever curvature is steep.':
    'Gauss–Kronrod-kvadratur sammenligner en 7-punkts Gauss-regel med en nøstet 15-punkts Kronrod-regel på hvert delintervall og deler automatisk opp der krumningen er bratt.',
  'u-Substitution reverses the chain rule. Look for an inner function g(x) whose derivative g′(x) appears (up to a constant factor) multiplying the rest of the integrand.':
    'u-substitusjon er det omvendte av kjerneregelen. Se etter en indre funksjon g(x) der den deriverte g′(x) inngår (opptil en konstant faktor) i resten av integranden.',
  'Products of sinusoids at different frequencies decompose into sum and difference frequencies, each of which integrates immediately.':
    'Produkter av sinuskurver med ulike frekvenser spaltes i sum- og differansefrekvenser, som hver kan integreres direkte.',
  'Whenever the denominator is a linear function of x, the antiderivative is a natural logarithm scaled by 1/a.':
    'Når nevneren er en lineær funksjon av x, er den antideriverte en naturlig logaritme skalert med 1/a.',
  'Substituting u = a sin(θ) turns √(a² − u²) into a cos(θ), canceling du = a cos(θ) dθ and leaving ∫ dθ = θ = arcsin(u/a).':
    'Substitusjonen u = a sin(θ) gjør √(a² − u²) om til a cos(θ), forkorter du = a cos(θ) dθ og gir ∫ dθ = θ = arcsin(u/a).',
  'Substituting u = a sinh(t) uses 1 + sinh²(t) = cosh²(t) to remove the square root.':
    'Substitusjonen u = a sinh(t) bruker 1 + sinh²(t) = cosh²(t) for å fjerne kvadratroten.',
  'Because the discriminant b² − 4ac < 0, the denominator has no real roots. Completing the square transforms it into the standard arctangent form 1/(u² + k²).':
    'Siden diskriminanten b² − 4ac < 0 har nevneren ingen reelle røtter. Fullstendig kvadrat omformer den til standard arctan-form 1/(u² + k²).',
  'Factoring k² from the denominator reduces 1/(u² + k²) to (1/k²) · 1/((u/k)² + 1), which integrates directly to arctan(u/k)/k.':
    'Å faktorisere k² ut av nevneren reduserer 1/(u² + k²) til (1/k²) · 1/((u/k)² + 1), som integreres direkte til arctan(u/k)/k.',
  'When a quadratic denominator factors into distinct linear factors, partial fractions splits one hard rational function into two simple 1/(x − r) logarithm integrals.':
    'Når en kvadratisk nevner faktoriseres i ulike lineære faktorer, deler delbrøkoppspalting én rasjonal funksjon i to enkle 1/(x − r)-logaritmeintegraler.',
  'Both exponentials and sinusoids repeat after two derivatives. Applying integration by parts twice brings back a multiple of the original integral I, which we solve algebraically for I.':
    'Både eksponential- og sinusfunksjoner gjentar seg etter to derivasjoner. To runder med delvis integrasjon gir et multiplum av det opprinnelige integralet I, som vi løser algebraisk for I.',
  'By the LIATE heuristic (Logarithmic, Inverse trig, Algebraic, Trigonometric, Exponential), logarithms are chosen for u because differentiating ln(x) turns it into the simple rational function 1/x.':
    'Etter LIATE-heuristikken (Logaritmisk, Invers trig, Algebraisk, Trigonometrisk, Eksponentiell) velges logaritmer som u fordi derivasjon av ln(x) gir den enkle rasjonale funksjonen 1/x.',
  'Integration by parts reverses the product rule. Choosing the polynomial for u reduces its degree each time until the remaining integral becomes elementary.':
    'Delvis integrasjon er det omvendte av produktregelen. Ved å velge polynomet som u senkes graden hver gang til det gjenværende integralet blir elementært.',

  // Verification notes & errors
  'Symbolic higher-order derivation (order > 2) verified algebraically.':
    'Symbolsk høyereordens derivasjon (orden > 2) er verifisert algebraisk.',
  'Expression contains extra symbolic parameters; verified symbolically.':
    'Uttrykket inneholder ekstra symbolske parametere; verifisert symbolsk.',
  'Finite-difference check saw large local curvature or discontinuity near sample points.':
    'Numerisk differansekontroll fant sterk lokal krumning eller diskontinuitet nær kontrollpunktene.',
  'Derivative order must be an integer between 1 and 4.':
    'Derivasjonsorden må være et heltall mellom 1 og 4.',
  'Could not parse expression.': 'Kunne ikke tolke uttrykket.',
  'Differentiation failed.': 'Derivasjon feilet.',
  'Could not parse integrand.': 'Kunne ikke tolke integranden.',
  'Definite integration requires both lower and upper bounds.':
    'Bestemt integrasjon krever både nedre og øvre grense.',
  'Enter numeric or symbolic bounds such as 0 and pi, or -1 and 1.':
    'Skriv inn numeriske eller symbolske grenser, for eksempel 0 og pi, eller -1 og 1.',
  'Could not parse integration bounds.': 'Kunne ikke tolke integrasjonsgrensene.',
  'Definite bounds must evaluate to finite real numbers (constants like pi, e, sqrt(2) are supported).':
    'Grenser for bestemt integral må gi endelige reelle tall (konstanter som pi, e og sqrt(2) støttes).',
  'Could not evaluate this definite integral numerically (integrand may have a singularity or extra symbolic parameters on the interval).':
    'Kunne ikke beregne dette bestemte integralet numerisk (integranden kan ha en singularitet eller ekstra symbolske parametere i intervallet).',
  'Check that the bounds avoid singularities (such as x = 0 for 1/x) and that all constants are numeric.':
    'Sjekk at grensene unngår singulariteter (som x = 0 for 1/x) og at alle konstanter er numeriske.',
  'No elementary symbolic antiderivative was found for this integrand.':
    'Fant ingen elementær symbolsk antiderivert for denne integranden.',
  'Switch to Definite mode with numeric bounds to compute a high-precision Gauss–Kronrod numerical integral, or try rewriting using an identity from the Identities & Rules tab.':
    'Bytt til Bestemt-modus med numeriske grenser for å beregne et numerisk Gauss–Kronrod-integral med høy presisjon, eller prøv å skrive om med en identitet fra Identiteter og regler.',
};
