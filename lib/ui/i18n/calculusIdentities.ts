export const en = {
  // Derivatives
  'calculus.id.diff-constant.name': 'Constant rule',
  'calculus.id.diff-constant.summary': 'The derivative of any constant is zero.',
  'calculus.id.diff-constant.theory':
    'A constant function never changes as x varies, so its tangent line is horizontal everywhere (slope 0).',

  'calculus.id.diff-linearity.name': 'Sum & difference rule (linearity)',
  'calculus.id.diff-linearity.summary': 'Differentiate term by term and pull out constant factors.',
  'calculus.id.diff-linearity.theory':
    'Because limits are linear, differentiation splits cleanly across addition, subtraction, and scalar multiplication.',

  'calculus.id.diff-const-mul.name': 'Constant multiple rule',
  'calculus.id.diff-const-mul.summary': 'Factor constants outside the derivative operator.',
  'calculus.id.diff-const-mul.theory':
    'Scaling a graph vertically by c scales every secant and tangent slope by the same factor c.',

  'calculus.id.diff-power.name': 'Power rule',
  'calculus.id.diff-power.summary': 'Bring the exponent down as a factor and reduce the exponent by 1.',
  'calculus.id.diff-power.theory':
    'Applies equally to positive integers, negative exponents (1/xⁿ = x⁻ⁿ), and fractional roots (√x = x^(1/2)).',

  'calculus.id.diff-product.name': 'Product rule',
  'calculus.id.diff-product.summary':
    'Derivative of the first times the second, plus the first times the derivative of the second.',
  'calculus.id.diff-product.theory':
    'Never multiply derivatives directly: the change in an area u·v comes from both changing u (strip u′v) and changing v (strip uv′).',

  'calculus.id.diff-quotient.name': 'Quotient rule',
  'calculus.id.diff-quotient.summary':
    'Low d-high minus high d-low, over the square of what is below.',
  'calculus.id.diff-quotient.theory':
    'Equivalent to applying the product rule to u·v⁻¹. The minus sign makes numerator order essential.',

  'calculus.id.diff-chain.name': 'Chain rule',
  'calculus.id.diff-chain.summary':
    'Differentiate the outer function evaluated at the inner function, then multiply by the inner derivative.',
  'calculus.id.diff-chain.theory':
    'Rates of change multiply along a chain of dependencies: dy/dx = (dy/du)·(du/dx).',

  'calculus.id.diff-exp.name': 'Exponential derivatives',
  'calculus.id.diff-exp.summary':
    'Natural exponentials reproduce themselves; general bases pick up a ln(a) factor.',
  'calculus.id.diff-exp.theory':
    'Base e is the unique base whose exponential slope at x = 0 equals 1; every other base a scales by ln(a).',

  'calculus.id.diff-ln.name': 'Natural logarithm derivative',
  'calculus.id.diff-ln.summary': 'Derivative of ln(u) is the inner derivative divided by u.',
  'calculus.id.diff-ln.theory':
    'This "logarithmic derivative" u′/u measures the relative (percentage) rate of change of u.',

  'calculus.id.diff-log.name': 'General base logarithm derivative',
  'calculus.id.diff-log.summary': 'Use change of base log_a(u) = ln(u)/ln(a) before differentiating.',
  'calculus.id.diff-log.theory':
    'Converting to natural logs brings out the constant factor 1/ln(a).',

  'calculus.id.diff-log-diff.name': 'Logarithmic differentiation',
  'calculus.id.diff-log-diff.summary': 'Used when both base and exponent depend on x (such as xˣ).',
  'calculus.id.diff-log-diff.theory':
    'Taking ln of both sides transforms uᵛ into v·ln(u), turning an unknown power-exponential hybrid into a product rule problem.',

  'calculus.id.diff-sin.name': 'Sine & cosine derivatives',
  'calculus.id.diff-sin.summary':
    'Differentiation shifts sine and cosine in a 4-step cycle (sin → cos → −sin → −cos).',
  'calculus.id.diff-sin.theory':
    'Measured in radians, the arc-length rate on the unit circle equals the angle rate, making the derivative factor cleanly equal to 1.',

  'calculus.id.diff-tan.name': 'Tangent, secant, cotangent & cosecant',
  'calculus.id.diff-tan.summary':
    'Co-functions (cos, cot, csc) always carry a negative sign in their derivatives.',
  'calculus.id.diff-tan.theory':
    'All four follow directly from sin/cos definitions via the quotient rule and Pythagorean identities.',

  'calculus.id.diff-atan.name': 'Inverse trigonometric derivatives',
  'calculus.id.diff-atan.condition': '|x| < 1 for arcsin/arccos',
  'calculus.id.diff-atan.summary': 'Inverse trig functions have purely algebraic derivatives.',
  'calculus.id.diff-atan.theory':
    'Derived by implicit differentiation of the forward trig relation and using sin² + cos² = 1 or 1 + tan² = sec².',

  'calculus.id.diff-sinh.name': 'Hyperbolic derivatives',
  'calculus.id.diff-sinh.summary': 'Hyperbolic sine and cosine swap with no minus sign.',
  'calculus.id.diff-sinh.theory':
    'Because sinh and cosh are linear combinations of eˣ and e⁻ˣ, their derivatives follow immediately from d/dx(e±ˣ) = ±e±ˣ.',

  // Integrals
  'calculus.id.int-constant.name': 'Constant & linearity rules',
  'calculus.id.int-constant.summary':
    'Integrate term by term, pull out constants, and append + C to indefinite integrals.',
  'calculus.id.int-constant.theory':
    'Linearity lets you break complex sums into simple table integrals. The constant + C captures all vertical shifts sharing the same derivative.',

  'calculus.id.int-power.name': 'Power rule for integration',
  'calculus.id.int-power.summary': 'Add 1 to the exponent and divide by the new exponent.',
  'calculus.id.int-power.theory':
    'Directly reverses the derivative power rule. Always check n ≠ −1 first; for n = −1 use ln|x|.',

  'calculus.id.int-reciprocal.name': 'Logarithmic reciprocal rule',
  'calculus.id.int-reciprocal.summary':
    'Handles the n = −1 exception where the power rule would divide by zero.',
  'calculus.id.int-reciprocal.theory':
    'Using |x| extends the antiderivative across both x > 0 and x < 0.',

  'calculus.id.int-usub.name': 'u-Substitution (reverse chain rule)',
  'calculus.id.int-usub.summary':
    'Spot a composite inner function g(x) whose derivative g′(x) multiplies the integrand.',
  'calculus.id.int-usub.theory':
    'The workhorse of integration: changing variables absorbs the chain-rule factor g′(x) dx into a single differential du.',

  'calculus.id.int-ibp.name': 'Integration by parts (LIATE)',
  'calculus.id.int-ibp.summary':
    'Choose u in LIATE order: Logarithmic, Inverse trig, Algebraic, Trigonometric, Exponential.',
  'calculus.id.int-ibp.theory':
    'Derived by integrating the product rule (uv)′ = u′v + uv′. Pick u so du becomes simpler and dv is easy to integrate.',

  'calculus.id.int-exp.name': 'Exponential integrals',
  'calculus.id.int-exp.summary': 'Exponentials remain exponentials, scaled by 1/a or 1/ln(b).',
  'calculus.id.int-exp.theory':
    'Reverses the chain-rule factor produced when differentiating e^(ax) or b^x.',

  'calculus.id.int-sin.name': 'Basic trigonometric integrals',
  'calculus.id.int-sin.summary':
    'Sine integrates to negative cosine; cosine integrates to positive sine.',
  'calculus.id.int-sin.theory':
    'Double-check signs by differentiating your answer back: d/dx(−cos x) = +sin x.',

  'calculus.id.int-sec2.name': 'Secant-squared & cosecant-squared',
  'calculus.id.int-sec2.summary': 'Immediate antiderivatives of 1/cos²(x) and 1/sin²(x).',
  'calculus.id.int-sec2.theory':
    'Recognizing 1/cos²(x) as sec²(x) saves lengthy trigonometric manipulation.',

  'calculus.id.int-atan.name': 'Arctangent form',
  'calculus.id.int-atan.summary': 'Irreducible sum-of-squares denominators integrate to arctangent.',
  'calculus.id.int-atan.theory':
    'Combine with completing the square to integrate any 1/(ax² + bx + c) with negative discriminant.',

  'calculus.id.int-asin.name': 'Arcsine form',
  'calculus.id.int-asin.summary':
    'Square root of (a² − x²) in the denominator integrates to arcsine.',
  'calculus.id.int-asin.theory':
    'Motivated by the trig substitution x = a sin(θ), which turns √(a² − x²) into a cos(θ).',

  'calculus.id.int-ftc.name': 'Fundamental Theorem of Calculus',
  'calculus.id.int-ftc.summary':
    'Evaluate any antiderivative at the upper bound minus the lower bound.',
  'calculus.id.int-ftc.theory':
    'Connects differentiation and integration as inverse operations, turning an infinite Riemann sum into a single subtraction.',

  // Trig Identities
  'calculus.id.trig-pythagorean.name': 'Pythagorean identity',
  'calculus.id.trig-pythagorean.summary':
    'Relates squared sine and cosine; essential for odd trig powers and simplification.',
  'calculus.id.trig-pythagorean.theory':
    'Expresses the unit circle equation x² + y² = 1 with x = cos θ and y = sin θ.',

  'calculus.id.trig-pyth-tan.name': 'Tangent–secant Pythagorean identity',
  'calculus.id.trig-pyth-tan.summary':
    'Converts tan² into sec² − 1 so it can be integrated immediately.',
  'calculus.id.trig-pyth-tan.theory':
    'Obtained by dividing sin²θ + cos²θ = 1 through by cos²θ (or sin²θ).',

  'calculus.id.trig-half-sin.name': 'Power-reduction (half-angle) for sine',
  'calculus.id.trig-half-sin.summary': 'Eliminates sin²(θ) by doubling the angle.',
  'calculus.id.trig-half-sin.theory':
    'Derived from cos(2θ) = 1 − 2sin²θ. Crucial whenever integrating even powers of sine.',

  'calculus.id.trig-half-cos.name': 'Power-reduction (half-angle) for cosine',
  'calculus.id.trig-half-cos.summary': 'Eliminates cos²(θ) by doubling the angle.',
  'calculus.id.trig-half-cos.theory':
    'Derived from cos(2θ) = 2cos²θ − 1. Turns squared cosine into a linear cosine term.',

  'calculus.id.trig-double.name': 'Double-angle identities',
  'calculus.id.trig-double.summary':
    'Converts products sin(θ)cos(θ) or squares into single double-angle waves.',
  'calculus.id.trig-double.theory':
    'Special cases of the angle-addition formulas with α = β = θ.',

  'calculus.id.trig-prod-to-sum.name': 'Product-to-sum identities',
  'calculus.id.trig-prod-to-sum.summary':
    'Splits products of different-frequency sinusoids into integrable sums.',
  'calculus.id.trig-prod-to-sum.theory':
    'In signal processing and Fourier analysis, this is frequency mixing (sum and difference frequencies).',

  // Hyperbolic
  'calculus.id.hyp-def.name': 'Exponential definitions',
  'calculus.id.hyp-def.summary': 'Odd and even parts of the exponential function eˣ.',
  'calculus.id.hyp-def.theory':
    'Any derivative or integral involving sinh or cosh can be checked instantly by expanding into eˣ and e⁻ˣ.',

  'calculus.id.int-hyp.name': 'Hyperbolic Pythagorean & integral forms',
  'calculus.id.int-hyp.summary': 'Minus sign replaces the plus sign of circular trigonometry.',
  'calculus.id.int-hyp.theory':
    'The point (cosh t, sinh t) traces the right branch of the unit hyperbola x² − y² = 1.',

  // Algebra & Logs
  'calculus.id.alg-exponents.name': 'Laws of exponents',
  'calculus.id.alg-exponents.summary':
    'Rewrite roots and denominators as fractional or negative powers before applying power rules.',
  'calculus.id.alg-exponents.theory':
    'Converting √x to x^(1/2) or 1/x³ to x⁻³ unifies radicals and reciprocals under one single power rule.',

  'calculus.id.alg-logs.name': 'Logarithm laws',
  'calculus.id.alg-logs.summary':
    'Expand logarithms of products, quotients, and powers before differentiating.',
  'calculus.id.alg-logs.theory':
    'Expanding ln((x²+1)/(x−3)) into ln(x²+1) − ln(x−3) completely avoids the quotient rule.',

  'calculus.id.alg-partial-fractions.name': 'Partial fraction decomposition',
  'calculus.id.alg-partial-fractions.summary':
    'Splits a factored rational function into simple logarithmic terms.',
  'calculus.id.alg-partial-fractions.theory':
    'Reverses finding a common denominator so each simple pole integrates to a natural logarithm.',

  'calculus.id.alg-complete-square.name': 'Completing the square',
  'calculus.id.alg-complete-square.summary':
    'Shifts an irreducible quadratic into u² + k² form for arctangent integration.',
  'calculus.id.alg-complete-square.theory':
    'Eliminates the linear term bx so the denominator matches standard inverse-trig or hyperbolic integral templates.',

  'calculus.id.alg-expand.name': 'Binomial expansion & algebraic simplification',
  'calculus.id.alg-expand.summary':
    'Expanding products often turns a hard integral into an elementary polynomial.',
  'calculus.id.alg-expand.theory':
    'Whenever an algebraic product is small, expanding before integrating avoids unnecessary substitutions.',
} as const;

export const nb: Record<keyof typeof en, string> = {
  // Derivatives
  'calculus.id.diff-constant.name': 'Konstantregel',
  'calculus.id.diff-constant.summary': 'Den deriverte av enhver konstant er null.',
  'calculus.id.diff-constant.theory':
    'En konstant funksjon endrer seg aldri når x varierer, så tangentlinjen er horisontal overalt (stigningstall 0).',

  'calculus.id.diff-linearity.name': 'Sum- og differanseregel (linearitet)',
  'calculus.id.diff-linearity.summary': 'Deriver ledd for ledd og sett konstante faktorer utenfor.',
  'calculus.id.diff-linearity.theory':
    'Fordi grenseverdier er lineære, kan derivasjon deles opp over addisjon, subtraksjon og skalar multiplikasjon.',

  'calculus.id.diff-const-mul.name': 'Konstantfaktorregel',
  'calculus.id.diff-const-mul.summary': 'Sett konstante faktorer utenfor derivasjonsoperatoren.',
  'calculus.id.diff-const-mul.theory':
    'Å skalere en graf vertikalt med c skalerer stigningstallet til alle sekanter og tangenter med samme faktor c.',

  'calculus.id.diff-power.name': 'Potensregel',
  'calculus.id.diff-power.summary': 'Flytt eksponenten ned som faktor og reduser eksponenten med 1.',
  'calculus.id.diff-power.theory':
    'Gjelder likt for positive heltall, negative eksponenter (1/xⁿ = x⁻ⁿ) og brøkeksponenter/røtter (√x = x^(1/2)).',

  'calculus.id.diff-product.name': 'Produktregel',
  'calculus.id.diff-product.summary':
    'Derivert av første faktor ganger andre, pluss første faktor ganger derivert av andre.',
  'calculus.id.diff-product.theory':
    'Multipliser aldri deriverte direkte: endringen i et areal u·v kommer både fra endring i u (stripe u′v) og endring i v (stripe uv′).',

  'calculus.id.diff-quotient.name': 'Brøkregel (kvotientregel)',
  'calculus.id.diff-quotient.summary':
    'Derivert av teller ganger nevner minus teller ganger derivert av nevner, delt på nevner i annen.',
  'calculus.id.diff-quotient.theory':
    'Tilsvarer å bruke produktregelen på u·v⁻¹. Minustegnet gjør rekkefølgen i telleren avgjørende.',

  'calculus.id.diff-chain.name': 'Kjerneregel',
  'calculus.id.diff-chain.summary':
    'Deriver den ytre funksjonen evaluert i kjernen, og multipliser med den deriverte av kjernen.',
  'calculus.id.diff-chain.theory':
    'Endringsrater multipliseres langs en kjede av avhengigheter: dy/dx = (dy/du)·(du/dx).',

  'calculus.id.diff-exp.name': 'Eksponentialderiverte',
  'calculus.id.diff-exp.summary':
    'Naturlige eksponentialfunksjoner gjengir seg selv; generelle grunntall får faktoren ln(a).',
  'calculus.id.diff-exp.theory':
    'Grunntallet e er det unike grunntallet der eksponentialkurvens stigningstall ved x = 0 er lik 1; ethvert annet grunntall a skalerer med ln(a).',

  'calculus.id.diff-ln.name': 'Derivert av naturlig logaritme',
  'calculus.id.diff-ln.summary': 'Den deriverte av ln(u) er den indre deriverte delt på u.',
  'calculus.id.diff-ln.theory':
    'Denne «logaritmiske deriverte» u′/u måler den relative (prosentvise) endringsraten til u.',

  'calculus.id.diff-log.name': 'Derivert av logaritme med generelt grunntall',
  'calculus.id.diff-log.summary': 'Bruk grunntallsskifte log_a(u) = ln(u)/ln(a) før derivasjon.',
  'calculus.id.diff-log.theory':
    'Omforming til naturlig logaritme trekker ut konstantfaktoren 1/ln(a).',

  'calculus.id.diff-log-diff.name': 'Logaritmisk derivasjon',
  'calculus.id.diff-log-diff.summary': 'Brukes når både grunntall og eksponent avhenger av x (som xˣ).',
  'calculus.id.diff-log-diff.theory':
    'Ved å ta ln på begge sider blir uᵛ til v·ln(u), som gjør en potens-eksponential-hybrid om til et produktregelproblem.',

  'calculus.id.diff-sin.name': 'Sinus- og cosinusderiverte',
  'calculus.id.diff-sin.summary':
    'Derivasjon flytter sinus og cosinus i en 4-stegs syklus (sin → cos → −sin → −cos).',
  'calculus.id.diff-sin.theory':
    'Når vinkler måles i radianer, er buelengderaten på enhetssirkelen lik vinkelraten, slik at derivasjonsfaktoren blir nøyaktig 1.',

  'calculus.id.diff-tan.name': 'Tangens, sekans, cotangens og cosekans',
  'calculus.id.diff-tan.summary':
    'Kofunksjoner (cos, cot, csc) har alltid negativt fortegn i sine deriverte.',
  'calculus.id.diff-tan.theory':
    'Alle fire følger direkte fra definisjonene med sin/cos via brøkregelen og den pytagoreiske identiteten.',

  'calculus.id.diff-atan.name': 'Inverse trigonometriske deriverte',
  'calculus.id.diff-atan.condition': '|x| < 1 for arcsin/arccos',
  'calculus.id.diff-atan.summary': 'Inverse trigonometriske funksjoner har rent algebraiske deriverte.',
  'calculus.id.diff-atan.theory':
    'Utledes ved implisitt derivasjon av den opprinnelige trigonometriske sammenhengen sammen med sin² + cos² = 1 eller 1 + tan² = sec².',

  'calculus.id.diff-sinh.name': 'Hyperbolske deriverte',
  'calculus.id.diff-sinh.summary': 'Hyperbolsk sinus og cosinus bytter plass uten minustegn.',
  'calculus.id.diff-sinh.theory':
    'Fordi sinh og cosh er lineærkombinasjoner av eˣ og e⁻ˣ, følger de deriverte umiddelbart fra d/dx(e±ˣ) = ±e±ˣ.',

  // Integrals
  'calculus.id.int-constant.name': 'Konstant- og linearitetsregler',
  'calculus.id.int-constant.summary':
    'Integrer ledd for ledd, trekk ut konstanter og legg til + C for ubestemte integraler.',
  'calculus.id.int-constant.theory':
    'Linearitet lar deg dele opp sammensatte summer i enkle tabellintegraler. Konstanten + C fanger opp alle vertikale forskyvninger med samme deriverte.',

  'calculus.id.int-power.name': 'Potensregel for integrasjon',
  'calculus.id.int-power.summary': 'Legg til 1 på eksponenten og del på den nye eksponenten.',
  'calculus.id.int-power.theory':
    'Reverserer potensregelen for derivasjon direkte. Sjekk alltid at n ≠ −1 først; for n = −1 brukes ln|x|.',

  'calculus.id.int-reciprocal.name': 'Logaritmisk resiprokregel',
  'calculus.id.int-reciprocal.summary':
    'Håndterer unntaket n = −1 der potensregelen ville delt på null.',
  'calculus.id.int-reciprocal.theory':
    'Bruk av absoluttverdi |x| utvider den antideriverte til både x > 0 og x < 0.',

  'calculus.id.int-usub.name': 'Substitusjon (omvendt kjerneregel)',
  'calculus.id.int-usub.summary':
    'Finn en sammensatt indre funksjon g(x) der den deriverte g′(x) inngår som faktor i integranden.',
  'calculus.id.int-usub.theory':
    'Arbeidshesten i integrasjonsregning: variabelskiftet absorberer kjerneregelfaktoren g′(x) dx i ett enkelt differensial du.',

  'calculus.id.int-ibp.name': 'Delvis integrasjon (LIATE)',
  'calculus.id.int-ibp.summary':
    'Velg u i LIATE-rekkefølge: Logaritmisk, Invers trig, Algebraisk, Trigonometrisk, Eksponential.',
  'calculus.id.int-ibp.theory':
    'Utledes ved å integrere produktregelen (uv)′ = u′v + uv′. Velg u slik at du blir enklere og dv er lett å integrere.',

  'calculus.id.int-exp.name': 'Eksponentialintegraler',
  'calculus.id.int-exp.summary': 'Eksponentialfunksjoner forblir eksponentialfunksjoner, skalert med 1/a eller 1/ln(b).',
  'calculus.id.int-exp.theory':
    'Reverserer kjerneregelfaktoren som oppstår ved derivasjon av e^(ax) eller b^x.',

  'calculus.id.int-sin.name': 'Grunnleggende trigonometriske integraler',
  'calculus.id.int-sin.summary':
    'Sinus integreres til negativ cosinus; cosinus integreres til positiv sinus.',
  'calculus.id.int-sin.theory':
    'Dobbeltsjekk fortegn ved å derivere svaret tilbake: d/dx(−cos x) = +sin x.',

  'calculus.id.int-sec2.name': 'Sekans i annen og cosekans i annen',
  'calculus.id.int-sec2.summary': 'Umiddelbare antideriverte av 1/cos²(x) og 1/sin²(x).',
  'calculus.id.int-sec2.theory':
    'Å gjenkjenne 1/cos²(x) som sec²(x) sparer langvarig trigonometrisk omskriving.',

  'calculus.id.int-atan.name': 'Arctangens-form',
  'calculus.id.int-atan.summary': 'Irredusible kvadratsummer i nevner integreres til arctangens.',
  'calculus.id.int-atan.theory':
    'Kombiner med fullstendig kvadrat for å integrere enhver 1/(ax² + bx + c) med negativ diskriminant.',

  'calculus.id.int-asin.name': 'Arcsinus-form',
  'calculus.id.int-asin.summary':
    'Kvadratroten av (a² − x²) i nevner integreres til arcsinus.',
  'calculus.id.int-asin.theory':
    'Motivert av den trigonometriske substitusjonen x = a sin(θ), som gjør √(a² − x²) om til a cos(θ).',

  'calculus.id.int-ftc.name': 'Analysens fundamentalteorem',
  'calculus.id.int-ftc.summary':
    'Evaluer enhver antiderivert i øvre grense minus nedre grense.',
  'calculus.id.int-ftc.theory':
    'Knytter derivasjon og integrasjon sammen som inverse operasjoner, og gjør en uendelig Riemann-sum om til én subtraksjon.',

  // Trig Identities
  'calculus.id.trig-pythagorean.name': 'Den pytagoreiske identiteten',
  'calculus.id.trig-pythagorean.summary':
    'Knytter kvadrert sinus og cosinus sammen; uunnværlig for odde trig-potenser og forenkling.',
  'calculus.id.trig-pythagorean.theory':
    'Uttrykker enhetssirkelens ligning x² + y² = 1 med x = cos θ og y = sin θ.',

  'calculus.id.trig-pyth-tan.name': 'Tangens–sekans pytagoreisk identitet',
  'calculus.id.trig-pyth-tan.summary':
    'Omskriver tan² til sec² − 1 slik at uttrykket kan integreres umiddelbart.',
  'calculus.id.trig-pyth-tan.theory':
    'Fås ved å dele sin²θ + cos²θ = 1 på cos²θ (eller sin²θ).',

  'calculus.id.trig-half-sin.name': 'Potensreduksjon (halvvinkel) for sinus',
  'calculus.id.trig-half-sin.summary': 'Eliminerer sin²(θ) ved å doble vinkelen.',
  'calculus.id.trig-half-sin.theory':
    'Utledet fra cos(2θ) = 1 − 2sin²θ. Avgjørende ved integrasjon av like potenser av sinus.',

  'calculus.id.trig-half-cos.name': 'Potensreduksjon (halvvinkel) for cosinus',
  'calculus.id.trig-half-cos.summary': 'Eliminerer cos²(θ) ved å doble vinkelen.',
  'calculus.id.trig-half-cos.theory':
    'Utledet fra cos(2θ) = 2cos²θ − 1. Gjør kvadrert cosinus om til et lineært cosinusledd.',

  'calculus.id.trig-double.name': 'Dobbelvinkelidentiteter',
  'calculus.id.trig-double.summary':
    'Gjør produkter sin(θ)cos(θ) eller kvadrater om til enkle dobbelvinkelbølger.',
  'calculus.id.trig-double.theory':
    'Spesialtilfeller av addisjonsformlene med α = β = θ.',

  'calculus.id.trig-prod-to-sum.name': 'Produkt-til-sum-identiteter',
  'calculus.id.trig-prod-to-sum.summary':
    'Deler produkter av sinuskurver med ulike frekvenser opp i integrerbare summer.',
  'calculus.id.trig-prod-to-sum.theory':
    'I signalbehandling og Fourier-analyse tilsvarer dette frekvensblanding (sum- og differansefrekvenser).',

  // Hyperbolic
  'calculus.id.hyp-def.name': 'Eksponentialdefinisjoner',
  'calculus.id.hyp-def.summary': 'Odde og like deler av eksponentialfunksjonen eˣ.',
  'calculus.id.hyp-def.theory':
    'Enhver derivert eller integral med sinh eller cosh kan sjekkes direkte ved å utvide til eˣ og e⁻ˣ.',

  'calculus.id.int-hyp.name': 'Hyperbolsk pytagoreisk identitet og integralform',
  'calculus.id.int-hyp.summary': 'Minustegn erstatter plusstegnet fra sirkulær trigonometri.',
  'calculus.id.int-hyp.theory':
    'Punktet (cosh t, sinh t) beskriver høyre gren av enhetshyperbelen x² − y² = 1.',

  // Algebra & Logs
  'calculus.id.alg-exponents.name': 'Potensregler',
  'calculus.id.alg-exponents.summary':
    'Skriv om røtter og nevnere som brøk- eller negative potenser før potensreglene brukes.',
  'calculus.id.alg-exponents.theory':
    'Å skrive √x som x^(1/2) eller 1/x³ som x⁻³ samler røtter og brøker under én enkelt potensregel.',

  'calculus.id.alg-logs.name': 'Logaritmesetninger',
  'calculus.id.alg-logs.summary':
    'Utvid logaritmer av produkter, brøker og potenser før derivasjon.',
  'calculus.id.alg-logs.theory':
    'Å utvide ln((x²+1)/(x−3)) til ln(x²+1) − ln(x−3) unngår brøkregelen fullstendig.',

  'calculus.id.alg-partial-fractions.name': 'Delbrøkoppspalting',
  'calculus.id.alg-partial-fractions.summary':
    'Deler en faktorisert rasjonal funksjon opp i enkle logaritmiske ledd.',
  'calculus.id.alg-partial-fractions.theory':
    'Reverserer fellesnevner slik at hver enkle pol integreres til en naturlig logaritme.',

  'calculus.id.alg-complete-square.name': 'Fullstendig kvadrat',
  'calculus.id.alg-complete-square.summary':
    'Omformer et irredusibelt andregradsuttrykk til formen u² + k² for arctangens-integrasjon.',
  'calculus.id.alg-complete-square.theory':
    'Eliminerer førstegradsleddet bx slik at nevneren passer med standardmaler for inverse trig- eller hyperbolske integraler.',

  'calculus.id.alg-expand.name': 'Kvadratsetninger og algebraisk forenkling',
  'calculus.id.alg-expand.summary':
    'Å gange ut produkter gjør ofte et vanskelig integral om til et enkelt polynom.',
  'calculus.id.alg-expand.theory':
    'Når et algebraisk produkt er lite, unngår man unødvendige substitusjoner ved å gange ut før integrasjon.',
};
