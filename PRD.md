# Animal Surrender Triage — Product Requirements Document

## 1. Summary

Animal shelters receive pet surrender and assistance requests through online forms that are delivered into a shared email inbox. Staff must manually review each submission, determine what type of situation it represents, assess how urgently it needs attention, and decide what kind of follow-up may be appropriate.

This creates two problems:

1. Requests are generally handled in inbox order rather than in order of need.
2. Staff must repeatedly interpret lengthy or inconsistent submissions to understand why the owner is seeking help and whether the situation is urgent.

The Animal Surrender Triage product will automatically identify surrender-related submissions, organize them into a dedicated workflow, classify the circumstances described in each request, assign a priority, and give staff an ordered queue of cases to review.

The product is intended to **assist shelter staff in triage, not make surrender or animal-welfare decisions autonomously**.



## 2. Problem

A surrender inbox can contain cases with dramatically different levels of urgency.

For example:

* An owner is planning to move in two months and cannot bring their dog.
* An owner is being evicted tomorrow and has nowhere for their dog to stay.
* A dog bit a household member and drew blood.
* A dog has an acute medical issue the owner cannot afford to treat.
* An owner primarily needs temporary foster care and may not need to surrender the animal at all.

These requests may currently arrive through the same form and appear in the same inbox without meaningful prioritization.

Staff therefore have to:

* Open each submission.
* Read structured and free-text responses.
* Determine the main reason for the request.
* Identify safety, medical, housing, or other urgent circumstances.
* Recognize cases where intervention could prevent surrender.
* Decide what to address first.

The result can be substantial repetitive work and a risk that a time-sensitive case remains buried behind lower-priority requests.



## 3. Product Vision

Turn the shelter's surrender inbox into an intelligent triage queue.

A staff member should be able to open their existing workflow and immediately understand:

* **What is this case about?**
* **How urgent is it?**
* **Why was it prioritized this way?**
* **What important circumstances were identified?**
* **Which cases should I review next?**

The system should reduce time spent sorting requests while keeping staff in control of every consequential decision.



## 4. Target Users

### Primary user: Animal Services / shelter intake staff

Staff members responsible for reviewing surrender and pet-help requests.

Their primary need is to quickly determine which cases require attention and what type of issue each request represents.

### Secondary user: Intake or shelter manager

A manager responsible for overseeing the surrender queue, ensuring high-priority cases are addressed, understanding request volume, and improving the shelter's triage process.

### Future user: Pet-retention or resource staff

Staff who may specifically handle requests where surrender could potentially be prevented through veterinary assistance, temporary foster care, behavioral support, food assistance, or other services.



## 5. Goals

### Goal 1: Reduce manual sorting

Staff should not have to read every submission simply to determine what kind of request it is.

### Goal 2: Surface urgent requests faster

Cases involving time-sensitive safety, medical, housing, or animal-welfare concerns should be easier to identify.

### Goal 3: Consistently categorize requests

Similar cases should be categorized consistently even when owners describe their circumstances differently.

### Goal 4: Identify surrender-prevention opportunities

The product should surface cases where the owner may be seeking surrender but the underlying issue could potentially be addressed through another service.

### Goal 5: Preserve human control

Staff must be able to understand, correct, or override the system's classification and priority.

### Goal 6: Fit the existing workflow

The first version should minimize changes to how the shelter receives requests and how staff work with email.



## 6. Non-Goals

The MVP will not:

* Automatically accept or reject surrender requests.
* Automatically determine whether an animal should be euthanized.
* Provide veterinary diagnoses.
* Make legal determinations regarding dangerous animals.
* Automatically contact pet owners.
* Replace the shelter's case-management or shelter-management system.
* Replace the shelter's existing surrender form.
* Require staff to adopt an entirely new intake workflow.
* Attempt to fully automate shelter intake decisions.

The product performs **triage and decision support**.



# 7. Core User Experience

## 7.1 Incoming request

An owner submits the shelter's existing surrender or pet-help form.

The existing system continues delivering that submission to the shelter's email inbox.

No changes to the public form should be required for the MVP.



## 7.2 Automatic detection

The system identifies that the incoming message is a surrender/pet-help form submission.

Non-surrender email should not enter the triage workflow.

Staff should not be required to manually move messages into the surrender workflow.



## 7.3 Automatic organization

Once identified, the submission should appear in a dedicated **Surrender Requests** workflow.

From the staff perspective, surrender requests should be visually separated from unrelated email.



## 7.4 Classification

The system analyzes the information contained in the form submission and assigns one or more categories.

Initial candidate categories include:

* Housing / landlord / moving
* Financial hardship
* Animal medical issue
* Owner medical issue
* Behavior
* Bite / aggression / safety
* Animal-to-animal conflict
* Unable to care for animal
* Too many animals / possible hoarding
* Lack of time
* Family or life change
* Rehoming assistance
* Temporary foster / boarding need
* Veterinary assistance
* Food / supply assistance
* Behavior assistance
* Humane euthanasia request
* Other / unclear

The taxonomy should be refined with shelter staff before production use.

A case may belong to multiple categories.

Example:

**Housing + Temporary Foster Opportunity**

rather than forcing the case into only one category.



## 7.5 Signal extraction

The system should identify important circumstances described in the request.

Potential signals include:

### Safety

* Recent human bite
* Bite causing injury
* Aggression toward people
* Threat to children or household members
* Animal cannot safely be contained
* Dangerous-animal status or similar concern

### Medical

* Serious injury
* Severe illness
* Animal appears to be suffering
* Owner cannot access necessary veterinary care
* Medical circumstances associated with a euthanasia request

### Time pressure

* Owner needs placement today
* Owner needs placement within 24–72 hours
* Imminent eviction
* Imminent homelessness
* Owner entering hospital, treatment, incarceration, etc.
* Animal currently has nowhere safe to stay

### Welfare

* Lack of food or basic care
* Unsafe living environment
* Suspected hoarding
* Animal currently abandoned or at risk of abandonment

### Surrender prevention

* Temporary foster could resolve the problem
* Temporary boarding could resolve the problem
* Veterinary assistance could resolve the problem
* Food or supplies could resolve the problem
* Behavior assistance could resolve the problem
* Owner appears interested in keeping the animal if assistance is available

These signals should be visible to staff when they materially affect priority.



# 8. Priority

Every surrender request should receive a priority level indicating how quickly it warrants staff review.

The final rubric must be defined with shelter staff.

The initial product concept is:

### P1 — Immediate

Potential emergency or serious safety/welfare concern requiring rapid review.

Illustrative examples:

* Acute medical suffering
* Serious recent bite or immediate human-safety issue
* Animal currently in a dangerous situation

### P2 — Urgent

Significant time-sensitive situation requiring prompt attention.

Illustrative examples:

* Owner loses housing tomorrow
* Animal has no safe placement after a near-term deadline
* Rapidly escalating care or behavioral issue

### P3 — Standard

Legitimate surrender or assistance request without an identified immediate deadline or emergency.

### P4 — Lower urgency

Request can reasonably remain in the normal queue without evidence of immediate risk or deadline.

These examples are product hypotheses rather than shelter policy.



## 8.1 Explainability

The product should never present priority as an unexplained score.

For each prioritized case, staff should be able to see the signals that caused it to be elevated.

Example:

**P2 — Urgent**

Reasons:

* Housing deadline within 48 hours
* Owner reports no alternative placement
* Temporary foster may prevent surrender

A staff member should be able to understand the prioritization without understanding how the underlying AI works.



# 9. Ranked Queue

The product should allow staff to work through surrender requests in priority order rather than simply chronological order.

The desired experience is conceptually:

| Priority | Request | Category | Key signal                   |
| -------- | ------- | -------- | ---------------------------- |
| P1       | Max     | Medical  | Acute injury                 |
| P1       | Buddy   | Safety   | Recent bite                  |
| P2       | Luna    | Housing  | Placement needed in 48h      |
| P2       | Charlie | Behavior | Escalating household concern |
| P3       | Daisy   | Rehoming | No immediate deadline        |

Within a priority band, the product may use an internal score to determine ordering.

Staff do not necessarily need to see the raw numerical score.



# 10. Email Experience

The existing inbox should remain useful even if staff do not use a separate dashboard.

For each processed surrender request, staff should be able to see:

* Priority
* Major categories
* That the request has been processed by the triage system

Example labels:

* P1 — Immediate
* P2 — Urgent
* P3 — Standard
* P4 — Low

and:

* Medical
* Housing
* Behavior
* Bite/Safety
* Financial
* Temporary Foster
* Retention Opportunity

The system should organize surrender requests without requiring shelter employees to manually maintain email rules.



# 11. Case Detail

A processed request should provide a concise staff-oriented summary.

Example:

**Luna — P2 Urgent**

Owner must leave current housing Friday. Temporary housing does not allow pets. Owner expects permanent pet-friendly housing within approximately three weeks.

**Categories**
Housing, Temporary Foster

**Key signals**
Housing deadline within 72 hours

**Potential retention opportunity**
Temporary foster or boarding may prevent surrender.

**Safety**
No recent bite reported.

**Medical**
No urgent medical issue identified.

The original submission must remain available so staff can verify the system's interpretation.



# 12. Human Review and Corrections

Staff must be able to correct the system.

At minimum, users should eventually be able to change:

* Priority
* Categories
* Important extracted signals

The system should record that a correction occurred.

Example:

**AI:** Behavior / P3
**Staff:** Behavior + Safety / P1

Staff corrections are particularly valuable because they can reveal where the product's taxonomy or priority rules need improvement.

The product should treat human review as a normal part of the workflow rather than as an error state.



# 13. Historical / Existing Requests

The product should eventually support processing existing surrender requests, not only new ones.

This enables:

* Initial evaluation before going live
* Comparison against historical staff handling
* Backfilling a queue
* Testing category and priority quality
* Product improvement using real shelter examples when appropriate permission is provided

Historical processing should clearly distinguish between historical analysis and active cases.



# 14. Product Requirements

## Must Have — MVP

### Intake

* Detect surrender-form submissions automatically.
* Exclude unrelated email.
* Process new submissions without staff intervention.

### Organization

* Place surrender submissions into a dedicated workflow.
* Visually distinguish processed requests.

### Classification

* Support multiple categories per request.
* Extract relevant contextual signals.
* Handle both structured form fields and free-text responses.

### Priority

* Assign a defined priority band.
* Order cases based on priority.
* Provide a human-readable explanation for prioritization.

### Staff workflow

* Preserve the original submission.
* Make classification and priority visible to staff.
* Allow the shelter to continue using its existing email workflow.

### Reliability

* Avoid processing the same submission multiple times.
* Avoid silently losing submissions.
* Clearly identify cases that could not be classified.

### Auditability

For every processed request, retain enough information to determine:

* What the system classified
* What priority it assigned
* Why
* When it was processed
* Whether staff later changed the result



# 15. Nice to Have After MVP

Potential subsequent capabilities include:

### Dedicated triage dashboard

A true priority-sorted work queue independent of email.

### Human feedback workflow

Simple controls such as:

* Priority is correct / incorrect
* Change category
* Change priority
* Mark signal as incorrect

### Retention recommendations

Surface relevant intervention types such as:

* Foster
* Boarding
* Veterinary help
* Behavior resources
* Food/supplies

The product should initially identify potential interventions rather than automatically promise specific resources.

### Operational analytics

Examples:

* Surrender requests per week
* Requests by category
* Requests by priority
* Percentage potentially preventable through assistance
* Median time to first review
* Housing-related request trends
* Medical-emergency volume
* Staff correction rate

### Additional email providers

Support organizations whose workflow uses a provider other than Microsoft.

### Additional intake forms

Support shelters whose form structure differs from the initial implementation.



# 16. Success Metrics

The pilot should evaluate both **model quality** and **operational value**.

## Classification quality

Measure agreement between the system and shelter staff for:

* Primary category
* Secondary categories
* Important safety signals
* Medical urgency signals
* Time-sensitive circumstances
* Retention opportunities

## Priority quality

Measure:

* Agreement between system priority and staff priority
* Recall of staff-designated high-priority cases
* Rate of severe under-prioritization
* Rate of unnecessary escalation

Missing a truly urgent case should be treated differently from classifying a routine case as slightly too urgent.

## Staff efficiency

Measure:

* Time spent reviewing/sorting surrender requests before vs. after
* Number of submissions staff must fully read before determining urgency
* Time from submission to first review for high-priority cases

## Adoption

Measure:

* Percentage of surrender requests successfully triaged
* Percentage requiring manual correction
* Whether staff actually use the prioritization in their workflow
* Qualitative staff confidence in the system



# 17. Initial Pilot Success Criteria

Exact thresholds should be agreed upon with the shelter before launch.

A successful pilot should demonstrate:

1. The product reliably identifies surrender submissions.
2. The vast majority of submissions can be assigned useful categories.
3. High-priority cases are rarely missed.
4. Staff can understand why a request received its priority.
5. Staff corrections can be captured.
6. The workflow saves staff meaningful review/sorting time.
7. The system fits into existing staff behavior with minimal training.
8. Staff perceive the ranked queue as more useful than chronological inbox order.



# 18. Safety and Product Principles

## Human decision-making

The product prioritizes information for review. Staff remain responsible for decisions affecting animals or owners.

## Prefer interpretable signals

Where possible, prioritization should be grounded in understandable circumstances such as:

* Recent bite
* Acute medical concern
* Housing deadline
* Animal without safe placement

rather than an opaque AI-generated judgment.

## Handle uncertainty explicitly

If the system cannot confidently determine something, it should say so.

For example:

**Recent bite: Unknown**

is preferable to inferring:

**Recent bite: No**

because none was mentioned.

## Preserve source material

Staff must always be able to review the original submission.

## Avoid false precision

Priority bands and reasons are more valuable to staff than presenting a seemingly scientific score such as `87.3`.

An internal score may still be useful for ordering.



# 19. Data Requirements

Before production rollout, the shelter should ideally provide a representative sample of historical surrender submissions that it is authorized to share for product development/evaluation.

Useful associated information would include, where available:

* Staff-assigned category
* Whether staff considered the case urgent
* Actions taken
* Retention assistance provided
* Whether surrender ultimately occurred
* Staff notes or corrections

Historical data should initially be used primarily to evaluate and refine the system rather than automatically treated as training data.



# 20. Product Rollout

## Phase 0 — Pre-engagement benchmark

Use public shelter data, published surrender narratives, and synthetic cases grounded in real distributions to develop an initial taxonomy and evaluation suite.

Goal:

Demonstrate that the product concept can reliably identify major categories and priority signals before accessing shelter data.

## Phase 1 — Historical evaluation

Run the product against a sample of historical shelter submissions.

Staff review outputs and establish:

* Final category taxonomy
* Priority definitions
* Important signals
* Common failure modes

No active workflow is changed.

## Phase 2 — Assisted live pilot

Process incoming surrender submissions.

The system:

* Identifies requests
* Classifies them
* Assigns priority
* Organizes them for staff

Staff continue making all intake decisions.

## Phase 3 — Ranked workflow

Introduce a dedicated priority-sorted queue if staff find email-only prioritization limiting.

## Phase 4 — Analytics and retention workflows

Expand into operational reporting and more sophisticated surrender-prevention support if the pilot validates demand.



# 21. Open Product Questions

The following should be answered with shelter staff before finalizing the pilot.

### Priority

* What circumstances should automatically trigger the highest priority?
* How should bite reports be handled?
* How should urgent medical needs be handled?
* Does housing loss tomorrow outrank serious but non-immediate behavior concerns?
* Should priority represent urgency to contact the owner or urgency to accept the animal?

### Categories

* What categories does staff already use informally?
* Are categories primarily useful for reporting, routing, or intervention?
* Which categories should be mutually exclusive, if any?

### Retention

* Which assistance programs does the shelter actually offer?
* Which cases should be routed to pet-retention staff?
* Should "potentially preventable surrender" be a category, a signal, or a separate workflow?

### Workflow

* Is the primary staff experience expected to remain Outlook?
* Do multiple staff members work the same inbox?
* How do staff currently indicate that someone has taken ownership of a case?
* Is chronological handling ever required regardless of priority?
* Does the shelter need separate queues for dogs, cats, or other animals?

### Feedback

* What is the easiest way for staff to correct the AI without adding meaningful work?
* Which corrections are most useful to capture?



# 22. MVP Definition

The MVP is successful if:

> A surrender form submission arrives through the shelter's existing workflow, is automatically recognized and organized, receives useful categories and an explainable priority, and appears to staff in a way that makes it obvious which requests deserve attention first.

The MVP does **not** need to automate the shelter.

It needs to make the surrender queue significantly easier to understand and work through.

