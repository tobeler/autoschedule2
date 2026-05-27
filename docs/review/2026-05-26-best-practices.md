# Best-in-Class HVAC Service Dispatch — 2026 Industry Benchmark

**Prepared for:** Jetson Schedule + Dispatch
**Date:** 2026-05-26
**Author:** Outside-in industry research (companion to internal code review + browser walkthrough)

---

## 1. Executive Summary

"Best-in-class HVAC dispatch" in 2026 is no longer defined by the dispatch board itself — drag-and-drop calendars are commodity. The bar has moved to **agentic, AI-assisted dispatch that runs continuously in the background, surfacing only exceptions for human judgment**, paired with a relentlessly mobile-friendly technician experience and a customer-comms layer that closes the trust gap (homeowners cite communication problems as 38% of their frustration with HVAC providers).

Five differentiators separate "best in class" from "table stakes":

1. **Agentic scheduling** — autonomous rescheduling, callback insertion, and route recompute with dispatcher acting as exception handler, not data-entry clerk. Gartner projects 40% of enterprise apps will embed task-specific AI agents by end of 2026.
2. **HVAC-aware capacity planning** — seasonal adaptive capacity, job-type rules, callback reservation (~20% of capacity), and skill+certification+truck-stock matching (not just proximity).
3. **First-Time-Fix as a north-star metric** — surfaced everywhere, with a closed loop from callback root-cause classification back into dispatch rules and tech training.
4. **Multi-day install workflow** — heat-pump installs span 2–3 days with permits, inspections, rebates, and crew continuity. Service-call-shaped software (Jobber, Housecall Pro) handles this poorly.
5. **Customer-grade comms** — booking → reminder → on-my-way → ETA → completion → invoice → review/survey, with SMS as the primary channel (98% open rate, 1–5 min read time).

A "great" 2026 product also brings **Linear/Superhuman-class UX velocity** (command palette, keyboard shortcuts, instant filters, optimistic updates) into a category historically dominated by 2010-era enterprise interfaces. This is Jetson's defensible wedge.

---

## 2. Competitor Matrix

Short, comparative read across the 10 platforms most often cited for HVAC dispatch in 2026. Pricing rounded; published-price columns are accurate as of May 2026, ServiceTitan and BuildOps are quote-only.

| Platform | Target buyer | Dispatch board | HVAC-specific marketed features | AI / agentic features | Pricing tier dispatch lives behind |
|---|---|---|---|---|---|
| **ServiceTitan** | Mid-market & enterprise residential + commercial HVAC | Map 2.0, capacity heatmap, drag-and-drop, vertical/horizontal toggle, modular holding-area panel | Adaptive Capacity Planning by job type/season; service-agreement auto-scheduling; Pricebook Pro; Titan Intelligence | "Smarter Routing" (visual map builder, GA Summer 2026); Titan Intelligence (LLM); ServiceTitan AI Voice Agents | Starter ~$245/tech/mo; Essentials ~$345; The Works ~$475+; Dispatch Pro, Marketing Pro, Phones Pro sold as add-ons (Marketing Pro $2k+/mo) |
| **BuildOps** | Commercial HVAC mechanical contractors | AI-native dispatch with auto-recompute on emergency insertion | Asset/nameplate capture, multi-day project + service unified, startup-report capture for warranty/rebates | AI dispatch reassign, AI service report from voice + photo, AI nameplate OCR | Quote-only; positioned premium commercial |
| **FieldEdge** | Residential HVAC, QuickBooks shops | Visual calendar, drag-drop, skill-and-location suggested assignment | Service agreements; flat-rate pricebook; QuickBooks bidirectional real-time sync (Intuit Platinum Partner) | Limited; mostly automation/reminders | $100–$200/user/mo; $500–$2,000 setup + 5-week onboarding |
| **Housecall Pro** | SMB residential (3–15 techs sweet spot) | Drag-drop, color-coded, "on-my-way" SMS + GPS tracking, route preview | Recurring service plans; price book; consumer financing | Pro AI add-ons; estimate AI; review-request automation | Basics $49/mo; Essentials $109; Max custom |
| **Jobber** | SMB residential & light commercial trades | Easiest-to-learn drag-drop timeline; one-click assignment; automated reminders | Generic, not HVAC-tuned | Limited; copilot summaries | Core $49/mo; Connect $139; Grow $279 (published) |
| **FieldPulse** | SMB multi-trade | Clean drag-drop with job-costing margin shown pre-assign | Job costing tied to dispatch; maintenance agreements with renewal reminders | Limited | Published low/mid-market |
| **ServiceFusion** | Mid-market multi-trade, unlimited users | Horizontal timeline per tech, batch job assignment, color-coded statuses | Unlimited users; service contracts | Limited | $100–$250/mo flat (unlimited users) |
| **Workiz** | SMB residential, inbound-call heavy | Drag-drop calendar, tech tracking, automated reminders | Inbound call center features, call recording, lead source attribution | Workiz AI receptionist | $65–$299/mo |
| **FieldRoutes** (ServiceTitan-owned) | Pest, lawn, **route-density businesses**; HVAC supported | Drag-drop, bulk reschedule, route-density optimization | Density-routing strengths transfer to maintenance routes | Goodcall integrations; ServiceTitan AI roadmap | Quote-only |
| **Sera** | Residential HVAC/plumbing/electrical, efficiency-focused | "Smart Dispatching" auto-match with claimed 80% manual-scheduling reduction; pay-for-performance | Membership-cost-savings quoting; tech-presents-multiple-quotes flow | Smart Dispatch auto-assign | Quote-only |
| **RazorSync** | SMB multi-trade | Drag-drop, multi-tech assignment to single job, GPS | Generic | Limited | Mid-market |

**Pattern:** ServiceTitan and BuildOps sit at the top with full AI suites and HVAC-aware data models. Mid-market (FieldEdge, Sera, ServiceFusion) competes on integrations and verticalization. SMB tier (Jobber, Housecall, Workiz, FieldPulse, RazorSync) competes on price and ease-of-onboarding but lacks multi-day install + commercial workflows.

---

## 3. Feature Checklist — Grouped, Tagged Table-Stakes (TS) vs Differentiator (D)

### Scheduling Engine
- **TS** Drag-and-drop dispatch board (daily, weekly views)
- **TS** Multi-tech / crew assignment to a single job
- **TS** Conflict detection (double-book, time overlap)
- **TS** Skill / certification filter before proximity logic (EPA 608, NATE, manufacturer certs)
- **TS** Truck/vehicle assignment, GPS location of assigned truck
- **TS** Job-type capacity rules (e.g., max 6 installs/day, no installs after 2pm Friday)
- **D** Adaptive seasonal capacity (auto-flex install vs service vs maintenance based on weather/season)
- **D** Reserved emergency / callback capacity (typically 20% holdback)
- **D** Multi-day project view — book weeks not hours; crew continuity across days
- **D** Auto-recompute routes on emergency insertion (keeps confirmed appts intact)
- **D** Drive-time-aware booking windows (live traffic from Google Maps / Mapbox Matrix API)
- **D** Parts-availability gate (won't dispatch if required SKU not on truck or in nearby warehouse)
- **D** Permit + inspection scheduling chained off install dates
- **D** Rebate / utility coordination workflow (IRA HEEHRA, HOMES, manufacturer rebates) with required-doc tracking

### Dispatcher UX
- **TS** Color-coded job statuses and job types
- **TS** Tech timeline view, customer / address quick-find
- **TS** Real-time updates (no refresh)
- **D** Capacity heatmap visualization (red/yellow/green per tech-day)
- **D** Linear-style command palette (Cmd-K) — "assign to nearest", "move to tomorrow", "send on-my-way"
- **D** Keyboard-first: Superhuman-grade shortcuts for power dispatchers (J/K, E to edit, A to assign, R to reschedule)
- **D** Inline editing of jobs without opening modals (Notion-style)
- **D** Optimistic UI with undo on every action
- **D** Saved/custom filter views per dispatcher
- **D** Side-by-side scenario planning ("what if I move these 3 jobs?")
- **D** AI suggestion ribbon — "Tech A finishing 30 min early near Job 47, reassign?"

### Field-Tech UX (Mobile)
- **TS** Job list / day view, customer details, navigation handoff to Maps app
- **TS** Status updates (en-route, arrived, working, complete)
- **TS** Photo capture, signature, on-device payment
- **TS** Forms / checklists (refrigerant weight, static pressure, temp split)
- **TS** Push notifications for schedule changes
- **D** Voice-to-report (snap nameplate + speak observations → AI generates startup report)
- **D** Asset / equipment history at the address (years of prior service, install date, model, serial)
- **D** Truck-stock real-time view + barcode/QR scan for parts use
- **D** Offline mode that actually works in mechanical rooms / basements
- **D** Large-glove-friendly touch targets (44+ pt buttons), high-contrast outdoor mode
- **D** In-app callback flag — tech can mark "this needs a follow-up", auto-creates dispatcher task
- **D** Manufacturer doc lookup (Bluon-style refrigerant cross-reference) without leaving app

### Customer Communication
- **TS** Booking confirmation (date/time/tech)
- **TS** Day-before reminder w/ confirm or reschedule
- **TS** "On my way" SMS with ETA and live tech map link
- **TS** Job-complete summary + invoice + payment link
- **TS** Post-job review / NPS request
- **D** Two-way SMS in dispatcher inbox (not just outbound)
- **D** Customer self-serve reschedule from SMS link
- **D** Live ETA that updates as tech moves (not static "between 1–4pm")
- **D** Photo + diagnostic summary delivered to customer (especially when not home)
- **D** Maintenance-plan-aware comms (renewal reminders, plan benefits explained)
- **D** Multi-language SMS (Spanish at minimum)

### Reporting & Owner / GM Dashboard
- **TS** Jobs completed / day per tech, revenue per job
- **TS** Service-agreement count, MRR, renewal rate
- **D** First-Time Fix rate by tech, by job type, by manufacturer
- **D** Callback rate with root-cause classification (parts, diagnostic, communication, knowledge)
- **D** Revenue per truck-hour (benchmark $180k–$280k/truck/yr; utilization target 65–75%, top 75–80%)
- **D** Drive-time vs wrench-time ratio
- **D** Booked-to-dispatched leakage funnel
- **D** Membership penetration % and renewal cohort
- **D** AI weekly summary ("here's what changed, here's what to fix")

### Integrations
- **TS** QuickBooks (Online + Desktop)
- **TS** Twilio / SMS provider
- **TS** Stripe + ACH + consumer financing
- **TS** Google Maps / Apple Maps navigation handoff
- **D** HubSpot or Salesforce CRM bidirectional (lead → estimate → job → revenue)
- **D** Zuper or chosen ops backbone (in Jetson's case)
- **D** DocuSign / digital signature for proposals + warranty docs
- **D** Slack notifications on key events (callback, big sale, no-show)
- **D** Inventory / parts vendor API (Ferguson, Johnstone, local supply house)
- **D** Utility rebate portals (Mass Save, ConEd, PG&E equivalents)
- **D** Smart-thermostat / IoT (ecobee, Nest, Honeywell) for proactive diagnostics
- **D** Open API + webhooks (table-stakes for any contractor over 10 techs)

### AI Assist
- **D** AI voice receptionist for after-hours and overflow ($0.30–$0.80/min, 20% revenue lift case studies)
- **D** Agentic dispatcher — proposes daily plan, handles rescheduling, escalates exceptions
- **D** Callback root-cause classifier
- **D** Demand forecasting (next 7–30 days) from weather, equipment age, service history
- **D** Service-report autogen from voice + photos (BuildOps-style)
- **D** AI estimate / option-builder ("Good-Better-Best" with rebate math baked in)
- **D** Customer-call summarization for the CSR/dispatcher

---

## 4. HVAC-Specific Must-Haves (workflows other trades don't need)

1. **Multi-day install with crew continuity** — heat-pump installs run 2–3 days, the same 2-person crew should follow the job, not be re-dispatched daily.
2. **EPA 608 + manufacturer + state license gating** on job assignment.
3. **Refrigerant tracking** — by truck, by job, by tech, for EPA compliance.
4. **Startup-report enforcement** — refrigerant weights, superheat/subcool, static pressure, temp split. Missing data voids manufacturer warranty and kills rebate eligibility.
5. **Permit + inspection chaining** — rough-in inspection, final inspection, AHJ-specific submittal.
6. **Rebate / utility coordination** — IRA HEEHRA (up to $8k), 25C tax credit (30% up to $2k), state rebates, manufacturer rebates. Required-doc checklist per program.
7. **Seasonal capacity flex** — summer cooling emergencies, fall maintenance push, winter no-heat triage.
8. **Maintenance plan recurring scheduling** — 1–2 visits/yr per plan, auto-generates jobs, with renewal cascade.
9. **Callback-first dispatch rule** — callbacks within X days must be assigned to the original tech, or with explicit handoff notes.
10. **Equipment-at-address history** — full prior-service record by serial number, not just by customer.
11. **Two-stage quoting** — quick diagnostic + options menu (often Good/Better/Best) presented in-home with financing.
12. **No-heat / no-cool urgent triage** — different SLAs and customer-comms scripts than routine service.
13. **Indoor air quality / accessory upsell capture** — IAQ accessories drive 15–25% of residential ticket size.

---

## 5. Gap-vs-Jetson Candidate List (outside-in, 15–25 features Jetson likely lacks)

Based on the project description (daily Dispatch board, Jobs, Projects, Technicians, Crews, Trucks, Timesheets, Reports, Settings; HubSpot read + Zuper write), these are candidates a code-level reviewer should verify. Ordered roughly by impact-per-effort.

1. **Agentic dispatch assistant** — Cmd-K natural-language: "fit a same-day no-heat in Belmont this afternoon."
2. **Capacity heatmap layer** on the Dispatch board (per-tech, per-day saturation %).
3. **Adaptive capacity rules** — job-type caps by season; reserve 20% for callbacks/urgent.
4. **Skill + certification gating** on assignment (EPA 608, NATE, manufacturer-specific, state license).
5. **Truck-stock awareness** — block dispatch if required SKU absent from assigned truck.
6. **Multi-day install / project view** — book a crew for a week, not hour-by-hour.
7. **Crew-continuity rule** — same crew follows the multi-day install by default.
8. **Live drive-time matrix** (Google Routes API or Mapbox Matrix) with traffic-aware ETAs.
9. **Auto-recompute on insertion** — when an emergency lands, propose minimum-disruption reshuffle.
10. **First-Time-Fix and callback-rate KPIs** with root-cause tagging on the callback workflow.
11. **Customer SMS comms suite** — 8-touchpoint cadence (book → confirm → on-my-way → ETA → arrival → diagnostic → invoice → review).
12. **Live ETA with tech-on-map link** (not just static window).
13. **Two-way SMS inbox** for dispatcher (not just outbound notifications).
14. **Self-serve customer reschedule** from confirmation SMS / email link.
15. **AI voice receptionist** for after-hours and overflow.
16. **Maintenance-plan engine** — auto-recurring jobs, renewal reminders, recurring billing.
17. **Permit + inspection sub-jobs** chained off install parent job.
18. **Rebate-program tracker** (IRA HEEHRA, 25C, state, manufacturer) with required-doc checklist.
19. **Startup-report templated form** with required fields enforced for install completion.
20. **Refrigerant-tracking ledger** per tech / per truck.
21. **Asset history by serial number** (not just by customer address).
22. **Command palette (Cmd-K)** and keyboard shortcut layer across Dispatch and Jobs.
23. **Optimistic UI + undo** on every drag/assignment.
24. **Saved filter views** per dispatcher with sharable links.
25. **Owner dashboard** with revenue/truck-hour, utilization, FTF, callback, NPS in one screen.
26. **Open webhook layer** so HubSpot/Zuper aren't the only integrations.

---

## 6. What "Best" Means by Role

- **Dispatcher** — situational awareness in one screen, keyboard-first speed, AI doing the routine reshuffles, alerts on exceptions only.
- **Field tech** — clear day plan, address+parts+history one tap away, voice-to-report at job close, offline reliability.
- **Owner / GM** — FTF, callback rate, revenue/truck-hour, utilization 65–75% target, membership penetration trend, AI weekly summary.
- **Customer** — knows when the tech is coming (live ETA), gets a photo summary even when not home, can reschedule from the text, never has to call twice.

---

## 7. Sources

- ServiceTitan — HVAC Dispatching: https://www.servicetitan.com/industries/hvac-software/dispatching
- ServiceTitan — Dispatch Software: https://www.servicetitan.com/features/dispatch-software
- ServiceTitan — Smarter Routing / Era of Automation: https://www.servicetitan.com/blog/webinar-recap-era-of-automation
- ServiceTitan — Map 2.0: https://help.servicetitan.com/docs/dispatch-efficiently-with-map-20
- ServiceTitan — Titan Intelligence: https://www.servicetitan.com/press/introducing-titan-intelligence
- ServiceTitan — Pantheon 2025 expansions: https://www.servicetitan.com/press/servicetitan-major-product-expansions-pantheon-2025
- ServiceTitan — Maintenance Agreements: https://www.servicetitan.com/industries/hvac-software/maintenance-agreements
- ServiceTitan — HVAC Service Contracts Guide 2026: https://www.servicetitan.com/blog/hvac-service-contracts
- ServiceTitan — AI Voice Agents in HVAC 2026: https://www.servicetitan.com/blog/ai-voice-agents-in-hvac
- ServiceTitan — Field Service Metrics 2026: https://www.servicetitan.com/blog/field-service-metrics
- ServiceTitan — Billable Hours Playbook: https://www.servicetitan.com/field-service-management/billable-hours
- ServiceTitan — HVAC AI Landscape 2026: https://www.servicetitan.com/blog/hvac-ai
- ServiceTitan pricing breakdowns: https://projul.com/blog/servicetitan-pricing-analysis-2026/ , https://fieldcamp.ai/reviews/servicetitan/
- BuildOps — Commercial HVAC: https://buildops.com/industries/hvac/
- BuildOps — HVAC AI Apps: https://buildops.com/resources/hvac-ai-apps/
- BuildOps — AI Dispatching Guide: https://buildops.com/resources/ai-dispatching-service-businesses/
- BuildOps — Best HVAC Software 2026: https://buildops.com/resources/best-hvac-software/
- BuildOps — HVAC Scheduling & Dispatching Guide: https://buildops.com/resources/hvac-scheduling-and-dispatching/
- BuildOps — HVAC Dispatcher Guide: https://buildops.com/resources/hvac-dispatcher/
- BuildOps — HVAC Inventory: https://buildops.com/resources/hvac-inventory-management-software/
- BuildOps — Field-Service Pricing Guide 2026: https://buildops.com/resources/field-service-software-pricing/
- BuildOps — Best AI Dispatch Tools: https://buildops.com/resources/ai-dispatch-software/
- FieldEdge — HVAC Software: https://fieldedge.com/hvac-software/
- FieldEdge — Field Service KPIs: https://fieldedge.com/blog/field-service-kpis/
- FieldEdge — Apps for HVAC: https://fieldedge.com/blog/apps-for-hvac/
- FieldEdge pricing: https://www.softwareadvice.com/field-service/fieldedge-profile/ , https://toricentlabs.com/blog/fieldedge-pricing-2026.html
- Housecall Pro — HVAC software: https://www.housecallpro.com/industries/hvac-software/
- Housecall Pro — Scheduling: https://www.housecallpro.com/features/scheduling-software/
- Housecall Pro — Service Agreements: https://www.housecallpro.com/features/recurring-service-plans/
- Housecall Pro pricing: https://desking.app/housecall-pro-review/ , https://research.com/software/reviews/housecall-pro
- Jobber — HVAC: https://www.getjobber.com/industries/hvac/
- Jobber — HVAC Dispatching Tips: https://www.getjobber.com/academy/hvac/hvac-dispatching/
- Jobber pricing: https://fieldcamp.ai/reviews/jobber/
- FieldPulse — HVAC Dispatch: https://www.fieldpulse.com/solutions/hvac-dispatch-software
- FieldPulse — Inventory: https://www.fieldpulse.com/features/inventory-management
- FieldPulse — Maintenance Agreements: https://www.fieldpulse.com/features/maintenance-agreements
- FieldPulse — ServiceTitan vs Housecall comparison: https://www.fieldpulse.com/resources/blog/servicetitan-vs-housecall-pro
- Service Fusion review: https://fieldcamp.ai/reviews/service-fusion/
- Workiz — HVAC scheduling best practices: https://www.workiz.com/blog/hvac/hvac-service-scheduling-best-practices/
- Workiz — Housecall Pro alternatives: https://www.workiz.com/blog/housecall-pro-competitors/
- RazorSync — HVAC: https://www.razorsync.com/resources/hvac-technicians-boost-productivity-razorsync/
- RazorSync vs Workiz: https://www.selecthub.com/field-service-software/razorsync-vs-workiz/
- RazorSync vs FieldRoutes: https://www.selecthub.com/field-service-software/razorsync-vs-fieldroutes/
- FieldRoutes — solutions: https://www.fieldroutes.com/solutions/pest-control-software , https://www.fieldroutes.com/blog/improve-route-efficiency-pest-control
- Sera — HVAC: https://sera.tech/who-we-serve/industry/hvac
- Sera — Dispatcher software blog: https://hubspot.sera.tech/blog/dispatcher-software-field-service
- Sera review: https://www.servicetitan.com/blog/sera-review
- FieldCamp — Best HVAC Dispatch Software 2026: https://fieldcamp.ai/blog/best-hvac-dispatch-software/
- FieldCamp — Best HVAC Scheduling Software 2026: https://fieldcamp.ai/blog/best-hvac-scheduling-software/
- Equipt.ai — AI Field Service 2026 Intelligent Dispatch: https://www.equipt.ai/blog/ai-field-service-2026-intelligent-dispatch-route-optimization-vs-basic-fsm
- Fieldproxy — AI Agents for Scheduling/Dispatch: https://www.fieldproxy.ai/resources/blog/ai-agents-scheduling-dispatching-automation
- Salesforce — Agentforce Field Service: https://www.salesforce.com/blog/field-service-scheduling-optimization-in-the-agentforce-era/
- IFS Tech / Medium — Agentic AI in FSM: https://medium.com/ifs-tech/agentic-ai-in-fsm-autonomous-multi-agent-collaboration-for-optimized-operations-f7ca2aa0ffd5
- Fieldcode — AI voice agents for field service intake: https://fieldcode.com/en/field-service-daily/ai-voice-agents-for-field-service-intake
- Bella FSM — AI Voice Agent Buyer's Guide 2026: https://www.bellafsm.com/ai-voice-agent-field-service/
- Avoca AI: https://www.avoca.ai/
- Goodcall — FieldRoutes AI integration: https://www.goodcall.com/business-productivity-ai/fieldroutes
- MIS Solutions — HVAC Scheduling & Dispatching: https://www.mis-solutions.com/2026/01/hvac-scheduling-and-dispatch/
- AirCall — HVAC 24/7 Same-Day Response: https://aircallservices.com/hvac-answers-24-7-hvac-services-same-day-response-essential-guide-for-property-managers/
- Continental Message — After-Hours HVAC Calls: https://www.continentalmessage.com/blog/how-to-handle-after-hours-hvac-calls/
- Oxmaint — HVAC Customer Comm Tools: https://oxmaint.com/industries/hvac/hvac-technician-customer-communication-tools
- Oxmaint — HVAC First-Time Fix AI: https://oxmaint.com/industries/hvac/hvac-contractor-first-time-fix-ai-diagnostics-case-study
- Oxmaint — HVAC AI FDD: https://oxmaint.com/industries/hvac/ai-fault-detection-diagnostics-fdd-commercial-hvac
- Llumin — AI Root Cause Analysis: https://llumin.com/blog/how-ai-root-cause-analysis-improves-maintenance-decisions/
- Cimetrics — HVAC Fault Detection AI: https://cimetrics.com/hvac-fault-detection-using-ai/
- OpusFlow — Heat Pump Installation Software: https://opusflow.io/industries/heat-pump-installations/
- Field Ascend — Boiler & Heat Pump UK: https://field-ascend.com/boiler-heat-pump-software
- PermitFlow — HVAC Permit Guide: https://www.permitflow.com/blog/hvac-permit
- PermitFlow — HVAC estimating/bidding: https://www.permitflow.com/blog/hvac-estimating-bidding-software
- Rebate Manager AI: https://rebatemanager.ai/
- Bosch — IRA Tax Credits & Rebates: https://www.bosch-homecomfort.com/us/en/residential/knowledge/tax-credits-rebates/inflation-reduction-act/
- ENERGY STAR — Air-Source Heat Pump Tax Credit: https://www.energystar.gov/about/federal-tax-credits/air-source-heat-pumps
- California Energy Commission — IRA Residential Rebates: https://www.energy.ca.gov/programs-and-topics/programs/inflation-reduction-act-residential-energy-rebate-programs
- IRS — Energy Efficient Home Improvement Credit: https://www.irs.gov/credits-deductions/energy-efficient-home-improvement-credit
- NRDC — IRA Consumer Guide: https://www.nrdc.org/stories/consumer-guide-inflation-reduction-act
- Google Maps Platform — Route Optimization: https://mapsplatform.google.com/solutions/offer-efficient-routes/
- Google Maps — Route Optimization Docs: https://developers.google.com/maps/documentation/route-optimization
- Mapbox — Traffic Data: https://www.mapbox.com/traffic-data
- Mapbox — On-Demand Logistics: https://www.mapbox.com/on-demand-logistics
- Mapbox Matrix API + traffic: https://blog.afi.io/blog/real-time-traffic-with-the-mapbox-api/
- Fieldwork — Field Service KPIs: https://fieldworkhq.com/2026/03/06/field-service-kpis/
- SmartServiceOps — KPI Dashboard by Role: https://smartserviceops.com/field-service-kpi-dashboard-by-role/
- SmartServiceOps — KPI Framework: https://smartserviceops.com/field-service-kpi-framework/
- Sharewillow — Field Service KPIs That Drive Profit: https://www.sharewillow.com/blog/field-service-kpis
- NetSuite — Field Service KPIs guide: https://www.netsuite.com/portal/resource/articles/erp/field-services-kpis-metrics.shtml
- Built on Tenth — HVAC Revenue/Truck Benchmark: https://www.builtontenth.com/insights/hvac-revenue-per-truck-benchmark/
- Attainment Labs — Tech Utilization Rate: https://www.attainmentlabs.com/glossary/technician-utilization-rate
- D-Tools — Improve Tech Utilization: https://www.d-tools.com/resource-center/operations-management/field-service-technician-utilization
- BDR — HVAC Business Software Guide 2026: https://www.bdrco.com/blog/hvac-business-software-guide/
- Software Advice — 22 Best HVAC Software 2026: https://www.softwareadvice.com/field-service/hvac-comparison/
- Field Service Software IO — ServiceTitan Competitors 2026: https://fieldservicesoftware.io/servicetitan-competitors/
- Workyard — Best HVAC Service Software 2026: https://www.workyard.com/compare/hvac-service-software
- Dispatch.me — Skills & Tech Matching: https://help.dispatch.me/article/467-technician-matching-company-skills
- Upper Inc — Auto Dispatch Guide: https://www.upperinc.com/blog/auto-dispatch-for-field-service/
- Superhuman blog — Building a Remarkable Command Palette: https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/
- Linear Keyboard Shortcuts: https://keycombiner.com/collections/linear/
- Morgen — Linear Best Practices: https://www.morgen.so/blog-posts/linear-project-management
- UX Patterns — Command Palette: https://uxpatterns.dev/patterns/advanced/command-palette
- Shunsuke Hayashi — Dispatch Board Redesign case study: https://shunsukehayashi.com/dispatch-board
- RationalGo — ServiceTitan Companion for HVAC Dispatchers: https://rationalgo.ai/resources/app-builder/servicetitan-companion-hvac-dispatchers
- Proven ROI — ServiceTitan Integrations 2026: https://www.provenroi.com/blog/available-servicetitan-integrations-connect-your-business-for-greater-efficiency-and-growth
- ServiceTitan Help — Available Integrations: https://help.servicetitan.com/how-to/available-servicetitan-integrations
