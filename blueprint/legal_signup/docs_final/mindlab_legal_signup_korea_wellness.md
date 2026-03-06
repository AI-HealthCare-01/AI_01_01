# MindLab legal and signup design guide (Korea, wellness / digital health support)

## 1. Scope assumption
This design assumes MindLab is positioned as a **wellness / digital health self-management support service**, not as a software medical device for diagnosis or treatment. Product copy, onboarding, help pages, and prompts should therefore focus on: daily check-in, habit coaching, challenge recommendation, trend dashboard, reflective support, and safety prompts. Avoid claims such as diagnosis, treatment, cure, or guaranteed therapeutic effect.

## 2. Key legal and ethical points to reflect in product design
### 2.1 Mental health related data should be treated conservatively as sensitive information
The service will process check-in data, periodic assessments, risk signals, and mental health related recommendation logs. These should be handled under a conservative sensitive-information design standard.

### 2.2 Separate consent structure is required
Membership signup should not bundle all purposes into one checkbox. The following should be visually separated:
- Terms of service / account creation
- Privacy processing for core service operation
- Sensitive information processing for mental health related records
- Optional personalized recommendation and service improvement
- Optional pseudonymized analytics / model improvement
- Overseas transfer notice / consent where applicable

### 2.3 Explain automated recommendations
If the service uses automated current-state estimation, challenge recommendation, or risk-triggered flow changes, the user should be informed that automated processing is used, what kinds of data are used at a high level, and how the user can request explanation, opt-out, or human review.

### 2.4 Wellness boundary for launch
To stay on the wellness / digital health support side, avoid positioning the service as replacing clinical care. Safety messaging should say the service is not an emergency response channel and does not substitute professional diagnosis or treatment.

## 3. Recommended signup implementation
## 3.1 Required signup steps
1. Account creation
2. Core service privacy notice
3. Separate sensitive-data consent
4. Optional personalized recommendation / model-improvement consent
5. Overseas transfer notice and consent if foreign infrastructure or APIs are used
6. Automated recommendation notice
7. Crisis-service disclaimer and safety guidance
8. Baseline assessment onboarding

## 3.2 Consent UI principles
- Distinguish required and optional items clearly.
- For each item show: purpose, collected fields, retention period, refusal right, and disadvantage if refused.
- Provide a short summary first and a full policy link.
- Do not make optional consent a condition of account creation.

## 3.3 Recommended consent groups
### Required
- Account and authentication data
- Daily check-in storage
- Challenge participation logs
- Current-state estimation required for dashboard and personalized daily summary
- Safety routing based on high-risk flags

### Optional
- Personalization improvement based on long-term usage patterns
- Pseudonymized analytics and model improvement
- Research / publication use, if ever planned, should be a distinct consent path

## 4. How to reflect this in privacy policy and product copy
### Privacy policy should clearly describe
- Processing purpose
- Data categories
- Retention period and deletion rules
- Sensitive-data handling
- Overseas transfer, if any
- Automated decision / recommendation procedures and request channel
- Data-subject rights and contact channel

### Product copy should use
- self-check
- habit coaching
- wellness support
- reflective support
- trend dashboard

### Product copy should avoid
- diagnosis of depression / anxiety / insomnia
- treatment claims
- guaranteed symptom improvement
- replacement of clinician or emergency support

## 5. Data use for post-launch model improvement
Use phased governance.
- Phase 0: collect real-world data, monitor quality, no major retraining yet
- Phase 1: calibrate outputs with sparse periodic assessments
- Phase 2: hybrid retraining with real data weighted above synthetic data
- Phase 3: real-data-first retraining when anchors and follow-up volume are sufficient

For each phase, keep safety policy and crisis routing under stricter change control than recommendation models.

## 6. Governance checklist for launch
- Separate sensitive-data consent implemented
- Optional model-improvement consent implemented
- Overseas transfer notice reviewed
- Automated recommendation explanation path implemented
- High-risk safety route documented
- Deletion / retention policy documented
- Access control and logging documented
- Public copy reviewed for wellness boundary

## 7. Caution
This blueprint is a product-design and governance document, not a legal opinion. If the service later expands into diagnosis-like claims, treatment claims, formal research, or stronger automated decisions with material effect, additional legal and regulatory review will be required.

## References
- Personal Information Protection Act, Korea
- Enforcement Decree of the Personal Information Protection Act, Korea
- Personal Information Protection Commission, Guide on rights regarding automated decisions, 2024
- Personal Information Protection Commission, Standards for controller measures regarding automated decisions
- Digital Medical Products Act and related digital health support framework guidance
- Ministry of Food and Drug Safety guidance on digital therapeutics / digital medical products
