# EM simulation – worked examples (step M4.1)

The page's Examples section, as data for step M4.2 (`lib/emsim/examples.ts`) and M4.3 (the section and its links).
Each example has an **id** (its anchor), a **title**, a short **intro**, the **links** that open its states (path
`/em-sim/main?` + `encodeLink(setup)` of `lib/emsim/link.ts`; each decodes with no issues to the setup described, checked
in [notes-M4.1.md](notes-M4.1.md)), **steps** (what to look at or change, what the reader sees, the engine's number and
the field it comes from) and the **topics** it uses. `⟨n⟩` are claims in [claims.md](claims.md); numbers are the engine's
at M = 2 (trace) and the via model's defaults (35 ps, 50 Ω ports) unless a step says otherwise. Examples are named by
stackup and structure only. The setups' recipes (for M4.2, which rebuilds the links in code and checks them against
these) are given with each link.

---

## 1. A 50 Ω microstrip on JLC061611-3313A (`ex-microstrip`)

**Intro.** A 0.1377 mm (5.42 mil) trace on L1 over the plane L2 of JLC061611-3313A, under solder mask: the width
JLCPCB's online calculator gives for 50 Ω on this stackup. What does the field solver say, and why does it differ?

**Links.**
- `stackup` (“Open the 0.1377 mm trace”) = `defaultSetup()`: `/em-sim/main?v=1`
- `w50` (“Open the width for 50 Ω (0.1465 mm)”) = the default with w 0.1465 mm: `/em-sim/main?v=1&t=(k:microstrip,l:L1,b:L2,w:0.1465)`
- `calc` (“Open with JLCPCB’s calculator inputs”) = `asJlcpcbCalculator(defaultSetup()).setup`: `/em-sim/main?v=1&s=(id:JLC061611-3313A,n:'JLCPCB%20JLC061611-3313A:%206%20layers,%201.6%20mm,%201%20oz%20outer,%201%20oz%20inner',l:!((k:m,id:MT,n:'Top%20mask',mat:'LPI%20solder%20mask',er:!(3.8,0),c1:!(0.0254,1),c2:!(0.015239999999999998,0),c3:!(0.0254,1)),(k:c,id:L1,n:'L1%20(top)',t:!(0.04064,1),ct:!(0.04064,2),e:!(o,!(0.00635,1))),(k:d,id:D1,n:'Prepreg%203313',r:p,mat:'3313',t:!(0.092,3),er:!(4.3,1)),(k:c,id:L2,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D2,n:'Core%20FR-4%20core%20(NP-155F)',r:c,mat:'FR-4%20core%20(NP-155F)',t:!(0.13,3),er:!(4.17,3)),(k:c,id:L3,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D3,n:'Prepreg%201080',r:p,mat:'1080',t:!(0.069,3),er:!(4.3,1)),(k:d,id:D4,n:'Core%20FR-4%20core,%20etched%20bare%20(NP-155F)',r:c,mat:'FR-4%20core,%20etched%20bare%20(NP-155F)',t:!(0.865,3),er:!(4.55,3)),(k:d,id:D5,n:'Prepreg%201080',r:p,mat:'1080',t:!(0.069,3),er:!(4.3,1)),(k:c,id:L4,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D6,n:'Core%20FR-4%20core%20(NP-155F)',r:c,mat:'FR-4%20core%20(NP-155F)',t:!(0.13,3),er:!(4.17,3)),(k:c,id:L5,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D7,n:'Prepreg%203313',r:p,mat:'3313',t:!(0.092,3),er:!(4.3,1)),(k:c,id:L6,n:'L6%20(bottom)',t:!(0.04064,1),ct:!(0.04064,2),e:!(o,!(0.00635,1))),(k:m,id:MB,n:'Bottom%20mask',mat:'LPI%20solder%20mask',er:!(3.8,0),c1:!(0.0254,1),c2:!(0.015239999999999998,0),c3:!(0.0254,1))))&src=!((k:p,id:JLC061611-3313A,r:U1),(k:p,id:JLC061611-3313A,r:S),(k:p,id:JLC061611-3313A,r:U2),(k:p,id:JLC061611-3313A,r:A))`

**Steps.**
1. Open the 0.1377 mm trace (`stackup`). The Trace results show Z0 51.50 ± 0.05 Ω, εeff 3.298 and 6.058 ps/mm (`lines[0].z0`, `eeff`,
   `delay`). ⟨206⟩
2. In Tools, Target 50 Ω by width: 0.1465 mm (0.14653 mm, 5.77 mil; `inverse(setup, 'z0', 50, 'w').w`); the link for 0.1465 mm (`w50`) has it,
   and reads 50.01 Ω. ⟨207⟩ So on the stackup's own values the 5.42 mil trace is 3 % above 50 Ω, well inside JLCPCB's
   ±10 % [JLCPCBCapabilities]. ⟨208⟩
3. Open the Calculators panel and switch to "as JLCPCB's calculator", or open the link with JLCPCB's calculator inputs (`calc`): 50.06 ± 0.06 Ω at the same
   0.1377 mm (εeff 3.363). ⟨209⟩ JLCPCB's calculator uses Polar Si9000 and gave 49.958 Ω at this width [JLCPCBCalc];
   ⟨210⟩ the tool is 0.20 % above it on the same inputs. ⟨211⟩ Its Target 50 Ω gives 5.435 mil (0.1380 mm). ⟨212⟩
4. Example 4 takes the 1.44 Ω between the two apart.

**Topics.** `transmission-lines`, `field-solver`, `solder-mask`, `trapezoid`, `jlcpcb-calculator`, `tolerances`.

---

## 2. A 100 Ω LVDS pair (`ex-lvds-pair`)

**Intro.** Two 0.11 mm traces 0.2 mm apart on L1 over L2 of the same stackup, the widths JLCPCB's calculator gives for
100 Ω differential (4.36 / 8 mil) as drawn in millimetres.

**Links.**
- `pair` (“Open the pair at 0.11 / 0.2 mm”) = the default stackup, `presetStructure('pair-microstrip', stackup, 0.11)` (gap 0.2): `/em-sim/main?v=1&t=(k:pair-microstrip,l:L1,b:L2,w:0.11)`
- `w100` (“Open the width for 100 Ω (0.1191 mm)”) = the same with w 0.1191 mm: `/em-sim/main?v=1&t=(k:pair-microstrip,l:L1,b:L2,w:0.1191)`
- `calc` (“Open the pair with JLCPCB’s calculator inputs”) = `asJlcpcbCalculator(pair).setup`: `/em-sim/main?v=1&s=(id:JLC061611-3313A,n:'JLCPCB%20JLC061611-3313A:%206%20layers,%201.6%20mm,%201%20oz%20outer,%201%20oz%20inner',l:!((k:m,id:MT,n:'Top%20mask',mat:'LPI%20solder%20mask',er:!(3.8,0),c1:!(0.0254,1),c2:!(0.015239999999999998,0),c3:!(0.0254,1)),(k:c,id:L1,n:'L1%20(top)',t:!(0.04064,1),ct:!(0.04064,2),e:!(o,!(0.00635,1))),(k:d,id:D1,n:'Prepreg%203313',r:p,mat:'3313',t:!(0.092,3),er:!(4.3,1)),(k:c,id:L2,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D2,n:'Core%20FR-4%20core%20(NP-155F)',r:c,mat:'FR-4%20core%20(NP-155F)',t:!(0.13,3),er:!(4.17,3)),(k:c,id:L3,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D3,n:'Prepreg%201080',r:p,mat:'1080',t:!(0.069,3),er:!(4.3,1)),(k:d,id:D4,n:'Core%20FR-4%20core,%20etched%20bare%20(NP-155F)',r:c,mat:'FR-4%20core,%20etched%20bare%20(NP-155F)',t:!(0.865,3),er:!(4.55,3)),(k:d,id:D5,n:'Prepreg%201080',r:p,mat:'1080',t:!(0.069,3),er:!(4.3,1)),(k:c,id:L4,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D6,n:'Core%20FR-4%20core%20(NP-155F)',r:c,mat:'FR-4%20core%20(NP-155F)',t:!(0.13,3),er:!(4.17,3)),(k:c,id:L5,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D7,n:'Prepreg%203313',r:p,mat:'3313',t:!(0.092,3),er:!(4.3,1)),(k:c,id:L6,n:'L6%20(bottom)',t:!(0.04064,1),ct:!(0.04064,2),e:!(o,!(0.00635,1))),(k:m,id:MB,n:'Bottom%20mask',mat:'LPI%20solder%20mask',er:!(3.8,0),c1:!(0.0254,1),c2:!(0.015239999999999998,0),c3:!(0.0254,1))))&t=(k:pair-microstrip,l:L1,b:L2,w:0.11)&src=!((k:p,id:JLC061611-3313A,r:U1),(k:p,id:JLC061611-3313A,r:S),(k:p,id:JLC061611-3313A,r:U2),(k:p,id:JLC061611-3313A,r:A))`

**Steps.**
1. Open the pair at 0.11 / 0.2 mm (`pair`): Zdiff 103.36 ± 0.15 Ω, Zcm 30.91 Ω (`pair.zdiff`, `pair.zcm`). ⟨213⟩
2. Zodd is 51.68 Ω, exactly half of Zdiff, and Zeven 61.82 Ω, twice Zcm: for a symmetric pair Zdiff = 2·Zodd
   [PolarAP157]. ⟨214⟩
3. Zdiff is not twice a lone trace's Z0: one 0.11 mm trace alone is 56.90 Ω, twice that 113.81 Ω. The neighbour takes
   10.4 Ω off: in the Zc matrix Zc11 = 56.75 Ω and Zc12 = 5.07 Ω, and Zdiff = Zc11 + Zc22 − 2·Zc12 = 103.36 Ω. ⟨215⟩
4. Target Zdiff 100 Ω by width at the 0.2 mm gap: 0.1191 mm (4.69 mil); the link for 0.1191 mm (`w100`) reads 100.01 Ω. ⟨216⟩
5. "As JLCPCB's calculator" (the link with JLCPCB's calculator inputs, `calc`): 100.01 ± 0.53 Ω at 0.11 / 0.2 mm; Si9000 gave 99.951 Ω at 4.356 / 8 mil
   [JLCPCBCalc]. ⟨217⟩
6. The two modes travel at different speeds: εeff 3.08 (odd) and 3.44 (even), 5.86 and 6.18 ps/mm (`modes[m]`). ⟨218⟩

**Topics.** `pairs` (`pair-definitions`, `coupling`, `two-speeds`), `calculators`.

---

## 3. The LVDS pair's via (`ex-via-pair`)

**Intro.** The pair of Example 2 changes from L1 to L6 through two vias: drill 0.22 mm, pads Ø0.5 on L1 and L6 only,
pitch 0.7 mm, a stadium antipad 1.22 × 1.92 mm on the planes L2 and L5, and six ground vias around them.

**Links.**
- `via` (“Open the via pair (2 mm feeds)”) = `pair` with `presetVia('pair', stackup)` (2 mm feeds): `/em-sim/main?v=1&t=(k:pair-microstrip,l:L1,b:L2,w:0.11)&via=(st:L1,en:L6,in:L1,out:L6,dr:0.22,pl:0.02,pi:0.7,pd:!(!(L1,0.5),!(L2,!n),!(L3,!n),!(L4,!n),!(L5,!n),!(L6,0.5)),pn:!(L2,L5),ap:!(!(L2,1.22,oblong),!(L5,1.22,oblong)),rv:!(!(0.67,-0.47,0.2,0.4,!(L2,L5)),!(-0.67,-0.47,0.2,0.4,!(L2,L5)),!(0,-0.81,0.2,0.4,!(L2,L5)),!(0.67,1.17,0.2,0.4,!(L2,L5)),!(-0.67,1.17,0.2,0.4,!(L2,L5)),!(0,1.51,0.2,0.4,!(L2,L5))),fd:!(!(L1,2,270),!(L6,2,90)))`
- `long` (“Open the via pair with 25 mm feeds”) = the same with 25 mm feeds: `/em-sim/main?v=1&t=(k:pair-microstrip,l:L1,b:L2,w:0.11)&via=(st:L1,en:L6,in:L1,out:L6,dr:0.22,pl:0.02,pi:0.7,pd:!(!(L1,0.5),!(L2,!n),!(L3,!n),!(L4,!n),!(L5,!n),!(L6,0.5)),pn:!(L2,L5),ap:!(!(L2,1.22,oblong),!(L5,1.22,oblong)),rv:!(!(0.67,-0.47,0.2,0.4,!(L2,L5)),!(-0.67,-0.47,0.2,0.4,!(L2,L5)),!(0,-0.81,0.2,0.4,!(L2,L5)),!(0.67,1.17,0.2,0.4,!(L2,L5)),!(-0.67,1.17,0.2,0.4,!(L2,L5)),!(0,1.51,0.2,0.4,!(L2,L5))),fd:!(!(L1,25,270),!(L6,25,90)))`

**Steps.**
1. Open the via pair (`via`). The barrel's Zdiff is 92.23 Ω in the 0.865 mm core and 97.16 Ω in the 3313 prepreg (`pieces[i].zdiff`).
   ⟨219⟩
2. The section as one element is 83.49 Ω differential, 36.63 Ω common, 12.59 ps (`lumped`); each via's pads and
   openings add 54.0 fF (`lumped.dCsum`). ⟨220⟩
3. Target Zdiff 100 Ω by the antipad: out of reach. Widening the antipad raises the section from 83.49 Ω at 1.22 mm to
   99.88 Ω at 3.27 mm, the widest the search tries (`viaTarget(…, 'zdiff', 100, 'antipad')`). ⟨221⟩ The pads on L1 and
   L6, 31.5 fF per via, stay whatever the antipad, and an antipad that wide already reaches past the ground vias 0.81 mm
   away. ⟨222⟩ 85 Ω is in reach, at Ø1.375 mm. ⟨223⟩
4. The differential TDR at 35 ps against 100 Ω: with the 2 mm feeds it dips to 91.59 Ω and never settles on the feeds;
   open the via pair with 25 mm feeds (`long`): flat at the feeds' 103.36 Ω, a dip to 91.65 Ω at the via, flat again after it. ⟨224⟩
5. Change the rise time to 15 ps: the dip deepens to 88.29 Ω; at 100 ps it is 97.99 Ω. ⟨225⟩
6. Sdd21 at 10 GHz is −0.05 dB and Sdd11 −19.4 dB; Scd21 is rounding noise, since the pair is symmetric. ⟨226⟩

**Topics.** `via-line`, `via-pads`, `via-return`, `via-tdr`, `via-sparams`, `via-limits`.

---

## 4. JLCPCB's widths explained (`ex-jlcpcb-widths`)

**Intro.** JLCPCB's calculator says 5.42 mil is 50 Ω on JLC061611-3313A; the tool says 51.50 Ω. Change the inputs one at
a time from JLCPCB's to the stackup's and watch where the 1.44 Ω comes from.

**Links.**
- `stackup` (“Open the 0.1377 mm trace”) = `defaultSetup()`: `/em-sim/main?v=1`
- `calc` (“Open with JLCPCB’s calculator inputs”) = `asJlcpcbCalculator(defaultSetup()).setup`: `/em-sim/main?v=1&s=(id:JLC061611-3313A,n:'JLCPCB%20JLC061611-3313A:%206%20layers,%201.6%20mm,%201%20oz%20outer,%201%20oz%20inner',l:!((k:m,id:MT,n:'Top%20mask',mat:'LPI%20solder%20mask',er:!(3.8,0),c1:!(0.0254,1),c2:!(0.015239999999999998,0),c3:!(0.0254,1)),(k:c,id:L1,n:'L1%20(top)',t:!(0.04064,1),ct:!(0.04064,2),e:!(o,!(0.00635,1))),(k:d,id:D1,n:'Prepreg%203313',r:p,mat:'3313',t:!(0.092,3),er:!(4.3,1)),(k:c,id:L2,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D2,n:'Core%20FR-4%20core%20(NP-155F)',r:c,mat:'FR-4%20core%20(NP-155F)',t:!(0.13,3),er:!(4.17,3)),(k:c,id:L3,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D3,n:'Prepreg%201080',r:p,mat:'1080',t:!(0.069,3),er:!(4.3,1)),(k:d,id:D4,n:'Core%20FR-4%20core,%20etched%20bare%20(NP-155F)',r:c,mat:'FR-4%20core,%20etched%20bare%20(NP-155F)',t:!(0.865,3),er:!(4.55,3)),(k:d,id:D5,n:'Prepreg%201080',r:p,mat:'1080',t:!(0.069,3),er:!(4.3,1)),(k:c,id:L4,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D6,n:'Core%20FR-4%20core%20(NP-155F)',r:c,mat:'FR-4%20core%20(NP-155F)',t:!(0.13,3),er:!(4.17,3)),(k:c,id:L5,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D7,n:'Prepreg%203313',r:p,mat:'3313',t:!(0.092,3),er:!(4.3,1)),(k:c,id:L6,n:'L6%20(bottom)',t:!(0.04064,1),ct:!(0.04064,2),e:!(o,!(0.00635,1))),(k:m,id:MB,n:'Bottom%20mask',mat:'LPI%20solder%20mask',er:!(3.8,0),c1:!(0.0254,1),c2:!(0.015239999999999998,0),c3:!(0.0254,1))))&src=!((k:p,id:JLC061611-3313A,r:U1),(k:p,id:JLC061611-3313A,r:S),(k:p,id:JLC061611-3313A,r:U2),(k:p,id:JLC061611-3313A,r:A))`
- `er` (“Open JLCPCB’s inputs with the stackup’s εr”) = `jlcAllBut(defaultSetup(), 'er')` (JLCPCB's inputs, εr as the stackup): `/em-sim/main?v=1&s=(id:JLC061611-3313A,n:'JLCPCB%20JLC061611-3313A:%206%20layers,%201.6%20mm,%201%20oz%20outer,%201%20oz%20inner',l:!((k:m,id:MT,n:'Top%20mask',mat:'LPI%20solder%20mask',er:!(3.8,0),c1:!(0.0254,1),c2:!(0.015239999999999998,0),c3:!(0.0254,1)),(k:c,id:L1,n:'L1%20(top)',t:!(0.04064,1),ct:!(0.04064,2),e:!(o,!(0.00635,1))),(k:d,id:D1,n:'Prepreg%203313',r:p,mat:'3313',t:!(0.092,3),er:!(4.1,3)),(k:c,id:L2,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D2,n:'Core%20FR-4%20core%20(NP-155F)',r:c,mat:'FR-4%20core%20(NP-155F)',t:!(0.13,3),er:!(4.17,3)),(k:c,id:L3,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D3,n:'Prepreg%201080',r:p,mat:'1080',t:!(0.069,3),er:!(3.91,3)),(k:d,id:D4,n:'Core%20FR-4%20core,%20etched%20bare%20(NP-155F)',r:c,mat:'FR-4%20core,%20etched%20bare%20(NP-155F)',t:!(0.865,3),er:!(4.55,3)),(k:d,id:D5,n:'Prepreg%201080',r:p,mat:'1080',t:!(0.069,3),er:!(3.91,3)),(k:c,id:L4,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D6,n:'Core%20FR-4%20core%20(NP-155F)',r:c,mat:'FR-4%20core%20(NP-155F)',t:!(0.13,3),er:!(4.17,3)),(k:c,id:L5,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D7,n:'Prepreg%203313',r:p,mat:'3313',t:!(0.092,3),er:!(4.1,3)),(k:c,id:L6,n:'L6%20(bottom)',t:!(0.04064,1),ct:!(0.04064,2),e:!(o,!(0.00635,1))),(k:m,id:MB,n:'Bottom%20mask',mat:'LPI%20solder%20mask',er:!(3.8,0),c1:!(0.0254,1),c2:!(0.015239999999999998,0),c3:!(0.0254,1))))&src=!((k:p,id:JLC061611-3313A,r:U1),(k:p,id:JLC061611-3313A,r:S),(k:p,id:JLC061611-3313A,r:U2),(k:p,id:JLC061611-3313A,r:A))`
- `copper` (“Open JLCPCB’s inputs with the stackup’s copper”) = `jlcAllBut(…, 'copper')`: `/em-sim/main?v=1&s=(id:JLC061611-3313A,n:'JLCPCB%20JLC061611-3313A:%206%20layers,%201.6%20mm,%201%20oz%20outer,%201%20oz%20inner',l:!((k:m,id:MT,n:'Top%20mask',mat:'LPI%20solder%20mask',er:!(3.8,0),c1:!(0.0254,1),c2:!(0.015239999999999998,0),c3:!(0.0254,1)),(k:c,id:L1,n:'L1%20(top)',t:!(0.035,2),ct:!(0.04064,3),e:!(o,!(0.00635,1))),(k:d,id:D1,n:'Prepreg%203313',r:p,mat:'3313',t:!(0.092,2),er:!(4.3,1)),(k:c,id:L2,t:!(0.03,2),ct:!(0.030479999999999997,3),e:!(o,!(0.008889999999999999,3))),(k:d,id:D2,n:'Core%20FR-4%20core%20(NP-155F)',r:c,mat:'FR-4%20core%20(NP-155F)',t:!(0.13,2),er:!(4.17,2)),(k:c,id:L3,t:!(0.03,2),ct:!(0.030479999999999997,3),e:!(o,!(0.008889999999999999,3))),(k:d,id:D3,n:'Prepreg%201080',r:p,mat:'1080',t:!(0.069,2),er:!(4.3,1)),(k:d,id:D4,n:'Core%20FR-4%20core,%20etched%20bare%20(NP-155F)',r:c,mat:'FR-4%20core,%20etched%20bare%20(NP-155F)',t:!(0.865,2),er:!(4.55,2)),(k:d,id:D5,n:'Prepreg%201080',r:p,mat:'1080',t:!(0.069,2),er:!(4.3,1)),(k:c,id:L4,t:!(0.03,2),ct:!(0.030479999999999997,3),e:!(o,!(0.008889999999999999,3))),(k:d,id:D6,n:'Core%20FR-4%20core%20(NP-155F)',r:c,mat:'FR-4%20core%20(NP-155F)',t:!(0.13,2),er:!(4.17,2)),(k:c,id:L5,t:!(0.03,2),ct:!(0.030479999999999997,3),e:!(o,!(0.008889999999999999,3))),(k:d,id:D7,n:'Prepreg%203313',r:p,mat:'3313',t:!(0.092,2),er:!(4.3,1)),(k:c,id:L6,n:'L6%20(bottom)',t:!(0.035,2),ct:!(0.04064,3),e:!(o,!(0.00635,1))),(k:m,id:MB,n:'Bottom%20mask',mat:'LPI%20solder%20mask',er:!(3.8,0),c1:!(0.0254,1),c2:!(0.015239999999999998,0),c3:!(0.0254,1))))&src=!((k:p,id:JLC061611-3313A,r:U1),(k:p,id:JLC061611-3313A,r:S),(k:p,id:JLC061611-3313A,r:A),(k:p,id:JLC061611-3313A,r:U2))`
- `etch` (“Open JLCPCB’s inputs with the stackup’s etch”) = `jlcAllBut(…, 'etch')`: `/em-sim/main?v=1&s=(id:JLC061611-3313A,n:'JLCPCB%20JLC061611-3313A:%206%20layers,%201.6%20mm,%201%20oz%20outer,%201%20oz%20inner',l:!((k:m,id:MT,n:'Top%20mask',mat:'LPI%20solder%20mask',er:!(3.8,0),c1:!(0.0254,1),c2:!(0.015239999999999998,0),c3:!(0.0254,1)),(k:c,id:L1,n:'L1%20(top)',t:!(0.04064,1),ct:!(0.04064,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D1,n:'Prepreg%203313',r:p,mat:'3313',t:!(0.092,3),er:!(4.3,1)),(k:c,id:L2,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D2,n:'Core%20FR-4%20core%20(NP-155F)',r:c,mat:'FR-4%20core%20(NP-155F)',t:!(0.13,3),er:!(4.17,3)),(k:c,id:L3,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D3,n:'Prepreg%201080',r:p,mat:'1080',t:!(0.069,3),er:!(4.3,1)),(k:d,id:D4,n:'Core%20FR-4%20core,%20etched%20bare%20(NP-155F)',r:c,mat:'FR-4%20core,%20etched%20bare%20(NP-155F)',t:!(0.865,3),er:!(4.55,3)),(k:d,id:D5,n:'Prepreg%201080',r:p,mat:'1080',t:!(0.069,3),er:!(4.3,1)),(k:c,id:L4,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D6,n:'Core%20FR-4%20core%20(NP-155F)',r:c,mat:'FR-4%20core%20(NP-155F)',t:!(0.13,3),er:!(4.17,3)),(k:c,id:L5,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D7,n:'Prepreg%203313',r:p,mat:'3313',t:!(0.092,3),er:!(4.3,1)),(k:c,id:L6,n:'L6%20(bottom)',t:!(0.04064,1),ct:!(0.04064,2),e:!(o,!(0.008889999999999999,2))),(k:m,id:MB,n:'Bottom%20mask',mat:'LPI%20solder%20mask',er:!(3.8,0),c1:!(0.0254,1),c2:!(0.015239999999999998,0),c3:!(0.0254,1))))&src=!((k:p,id:JLC061611-3313A,r:U1),(k:p,id:JLC061611-3313A,r:S),(k:p,id:JLC061611-3313A,r:U2),(k:p,id:JLC061611-3313A,r:A))`
- `mask` (“Open JLCPCB’s inputs with the stackup’s mask”) = `jlcAllBut(…, 'mask')`: `/em-sim/main?v=1&s=(id:JLC061611-3313A,n:'JLCPCB%20JLC061611-3313A:%206%20layers,%201.6%20mm,%201%20oz%20outer,%201%20oz%20inner',l:!((k:m,id:MT,n:'Top%20mask',mat:'LPI%20solder%20mask',er:!(3.8,0),c1:!(0.030479999999999997,0),c2:!(0.015239999999999998,0),c3:!(0.030479999999999997,0)),(k:c,id:L1,n:'L1%20(top)',t:!(0.04064,1),ct:!(0.04064,2),e:!(o,!(0.00635,1))),(k:d,id:D1,n:'Prepreg%203313',r:p,mat:'3313',t:!(0.092,3),er:!(4.3,1)),(k:c,id:L2,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D2,n:'Core%20FR-4%20core%20(NP-155F)',r:c,mat:'FR-4%20core%20(NP-155F)',t:!(0.13,3),er:!(4.17,3)),(k:c,id:L3,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D3,n:'Prepreg%201080',r:p,mat:'1080',t:!(0.069,3),er:!(4.3,1)),(k:d,id:D4,n:'Core%20FR-4%20core,%20etched%20bare%20(NP-155F)',r:c,mat:'FR-4%20core,%20etched%20bare%20(NP-155F)',t:!(0.865,3),er:!(4.55,3)),(k:d,id:D5,n:'Prepreg%201080',r:p,mat:'1080',t:!(0.069,3),er:!(4.3,1)),(k:c,id:L4,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D6,n:'Core%20FR-4%20core%20(NP-155F)',r:c,mat:'FR-4%20core%20(NP-155F)',t:!(0.13,3),er:!(4.17,3)),(k:c,id:L5,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D7,n:'Prepreg%203313',r:p,mat:'3313',t:!(0.092,3),er:!(4.3,1)),(k:c,id:L6,n:'L6%20(bottom)',t:!(0.04064,1),ct:!(0.04064,2),e:!(o,!(0.00635,1))),(k:m,id:MB,n:'Bottom%20mask',mat:'LPI%20solder%20mask',er:!(3.8,0),c1:!(0.030479999999999997,0),c2:!(0.015239999999999998,0),c3:!(0.030479999999999997,0))))&src=!((k:p,id:JLC061611-3313A,r:U1),(k:p,id:JLC061611-3313A,r:S),(k:p,id:JLC061611-3313A,r:U2),(k:p,id:JLC061611-3313A,r:A))`

**Steps.**
1. Open the link with JLCPCB's calculator inputs (`calc`): the calculator sends εr 4.3 for the prepreg, 1.6 mil outer copper, a top 0.5 mil narrower than the
   base and mask 1.0 / 0.6 / 1.0 mil at εr 3.8 [JLCPCBCalc]; ⟨227⟩ with these the tool gives 50.06 Ω. ⟨228⟩
2. Open JLCPCB's inputs with the stackup's εr (`er`): the prepreg's own εr 4.1 gives 51.00 Ω, +0.94 Ω. ⟨229⟩
3. With the stackup's copper (`copper`): 0.035 mm copper instead of 1.6 mil, 50.57 Ω, +0.51 Ω. ⟨230⟩
4. With the stackup's etch (`etch`): 0.35 mil per side instead of 0.25, 50.30 Ω, +0.25 Ω. ⟨231⟩
5. With the stackup's mask (`mask`): 1.2 mil of mask instead of 1.0, 49.79 Ω, −0.27 Ω. ⟨232⟩
6. The four add up to +1.43 Ω against the whole +1.44 Ω (51.50 − 50.06): the parts barely interact. ⟨233⟩ For the pair
   of Example 2 the same parts are +1.70, +1.63, +0.73 and −0.73 Ω, 3.33 Ω against the whole 3.36 Ω. ⟨234⟩
7. On the same inputs the two solvers agree within 0.2 %; the 3 % comes from the inputs, mostly εr: the stackup lists
   4.1 for the 3313 prepreg [JLCPCBCalcGuide], the calculator sends 4.3. ⟨235⟩

**Topics.** `jlcpcb-calculator`, `calculators`, `solder-mask`, `trapezoid`, `copper-thickness`.

---

## 5. A 0.6/0.3 via: the line, a stub and backdrill (`ex-via-stub`)

**Intro.** A through via of 0.3 mm drill with 0.6 mm pads on every layer, antipads Ø1.8 on L2 and L5 and two ground vias
0.8 mm away, between 50 Ω microstrips on L1 and L6. Then the signal leaves on L3 instead, and the rest of the barrel
is a stub.

**Links.**
- `through` (“Open the through via”) = `defaultSetup()` with 25 mm feeds: `/em-sim/main?v=1&via=(st:L1,en:L6,in:L1,out:L6,dr:0.3,pl:0.02,pd:!(!(L1,0.6),!(L2,0.6),!(L3,0.6),!(L4,0.6),!(L5,0.6),!(L6,0.6)),pn:!(L2,L5),ap:!(!(L2,1.8,round),!(L5,1.8,round)),rv:!(!(0,0.8,0.3,0.6,!(L2,L5)),!(0,-0.8,0.3,0.6,!(L2,L5))),fd:!(!(L1,25,180),!(L6,25,0)))`
- `stub` (“Open the via with a stub”) = `defaultSetup()` with the exit on L3 and only the L1 feed: `/em-sim/main?v=1&via=(st:L1,en:L6,in:L1,out:L3,dr:0.3,pl:0.02,pd:!(!(L1,0.6),!(L2,0.6),!(L3,0.6),!(L4,0.6),!(L5,0.6),!(L6,0.6)),pn:!(L2,L5),ap:!(!(L2,1.8,round),!(L5,1.8,round)),rv:!(!(0,0.8,0.3,0.6,!(L2,L5)),!(0,-0.8,0.3,0.6,!(L2,L5))),fd:!(!(L1,2,180)))`
- `backdrill` (“Open the stub backdrilled”) = `stub` backdrilled from the bottom, 1.2 mm deep, Ø0.5: `/em-sim/main?v=1&via=(st:L1,en:L6,in:L1,out:L3,dr:0.3,pl:0.02,pd:!(!(L1,0.6),!(L2,0.6),!(L3,0.6),!(L4,0.6),!(L5,0.6),!(L6,0.6)),pn:!(L2,L5),ap:!(!(L2,1.8,round),!(L5,1.8,round)),bd:!(bottom,1.2,0.5),rv:!(!(0,0.8,0.3,0.6,!(L2,L5)),!(0,-0.8,0.3,0.6,!(L2,L5))),fd:!(!(L1,2,180)))`

**Steps.**
1. Open the through via (`through`). The barrel is 59.71 Ω in the core (`pieces[i].z0`), but the section as one element is 50.23 Ω,
   13.55 ps: the pads and planes add 90.0 fF to 179.8 fF of barrel (`lumped`). ⟨236⟩
2. The TDR at 35 ps is flat at the feeds' 51.50 Ω and dips to 50.81 Ω at the via; at 15 ps the pads (48.54 Ω) and the
   barrel (55.32 Ω) show apart. ⟨237⟩ Target 50 Ω by the antipad: Ø1.758 mm. ⟨238⟩
3. Open the via with a stub (`stub`): the barrel below L3 is a 1.335 mm stub (9.19 ps). Its bare quarter wave is 27.2 GHz; with its pads it
   resonates at 21.8 GHz, where |S21| falls to −48.6 dB, and the page flags it inside the 25.0 GHz band. ⟨239⟩ At
   10 GHz S21 is already −0.67 dB and S11 −8.4 dB (with the 2 mm feed; E without it: −0.68 dB). ⟨240⟩
4. Open the stub backdrilled (`backdrill`): 0.165 mm of stub is left, resonating near 215 GHz; at 10 GHz S21 is −0.07 dB and S11 −18.1 dB (−18.0 without the feed), and
   the stub flag is gone. ⟨241⟩

**Topics.** `via-line`, `via-pads`, `via-stubs`, `via-tdr`, `via-sparams`, `via-limits`.
