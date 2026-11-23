# Which engagement Notifications bring Students back?

Research for [#5](https://github.com/mantadigitalau/cohort-005-project/issues/5), part of map [#2](https://github.com/mantadigitalau/cohort-005-project/issues/2). Researched 2026-11-23.

## Answer in brief

- **No Notification type has a large, reliable effect.** The best-controlled evidence finds that reminders and nudges move return rates by low single-digit percentages at most, and often not at all (see [Kizilcec et al. 2020](#s2), [NeCamp et al. 2019](#s3), [Yancey & Settles 2020](#s1)).
- **Volume is the main way to cause harm.** Every first-party source treats unsubscribes and opt-outs as a lasting cost and limits volume on purpose ([LinkedIn](#s5), [Duolingo via Mazal](#s6)).
- **Target by Student state.** In the only randomised email-reminder trial in a course setting, reminders helped inactive Students but may have deterred active ones ([NeCamp et al. 2019](#s3)).
- **For Cadence:** send Notifications that are *about something real* (an Instructor reply, new content, a milestone reached). Add one limited inactivity nudge. Do not start with a streak mechanic.

## Evidence by strength

### Strong: peer-reviewed, randomised, at scale

<a id="s1"></a>**S1. Duolingo daily practice reminders: Yancey & Settles, "A Sleeping, Recovering Bandit Algorithm for Optimizing Recurring Notifications", KDD 2020** ([PDF](https://research.duolingo.com/papers/yancey.kdd20.pdf), [DOI 10.1145/3394486.3403351](https://doi.org/10.1145/3394486.3403351))
- Duolingo sends one daily practice reminder built from hand-written templates. Some templates have eligibility rules, for example "Must have a 3+ day streak".
- **Novelty effect:** templates a user had not seen recently converted better. The paper says the same template sent "day after day … will get repetitive, desensitize users, and fail to improve engagement in the long run." The penalty for repeating a template was modelled as decaying with a **15-day half-life**.
- **Online A/B test result** (bandit compared with uniform-random template choice, a baseline "optimized through years of A/B tests"): **DAU +0.5%, lessons completed +0.4%, new-user D1 retention +2.2%, new-user D7 retention +2.0%**. For existing users, D1 rose 0.5% and D7 rose 0.2% (not significant). After five months the bandit still showed 2.5% higher reward against a 5% holdout.
- Takeaway: rotating and varying the copy of one daily reminder gives small gains, and the gains are concentrated in **new** users who are still forming habits.

<a id="s2"></a>**S2. Kizilcec, Reich, Yeomans et al., "Scaling up behavioral science interventions in online education", PNAS 117(26), 2020** ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC7334459), [Cornell summary](https://news.cornell.edu/node/319503))
- About 250,000 students in 247 Harvard, MIT and Stanford MOOCs over 2.5 years. Tested planning and self-regulation prompts and value-relevance prompts.
- Effects were "an order of magnitude smaller" than in earlier small studies. Self-regulation prompts raised engagement in the first weeks but **not completion**. Machine-learning targeting did **not** beat a one-size-fits-all policy.
- Takeaway: expect small effects from any single nudge, and do not build an elaborate personalisation engine before you have the basics.

<a id="s3"></a>**S3. NeCamp, Gardner & Brooks, "Beyond A/B Testing: Sequential Randomization…" (PERCS trial, Coursera "Applied Data Science with Python"), 2019** ([arXiv 1810.11185](https://arxiv.org/abs/1810.11185))
- Weekly reminder emails were randomised each week against a no-email control. About 22,000 emails went to Indian and US learners.
- Indian learners: largely positive effects in weeks 2–3. US learners: "effects are non-significant … and the log odds ratios are small and in many cases negative", so emails "may even deter them from returning".
- **Activity moderated the effect.** By week 3, the effect was positive for inactive learners and negative for active learners. The authors conclude that "email sending should adapt based on course activity and the course week."
- Open rates (41.7% US against 27.0% India) did not predict effect. Opens are a poor proxy for return.
- Takeaway: **do not send "come back" nudges to Students who are already active.** Only Students who have actually lapsed should get them.

<a id="s4"></a>**S4. Pielot, Church & de Oliveira, "An In-Situ Study of Mobile Phone Notifications", MobileHCI 2014** ([PDF](https://ic.unicamp.br/~oliveira/doc/MHCI2014_An-in-situ-study-of-mobile-phone-notifications.pdf))
- 15 users received about 63.5 notifications a day, and most were viewed within minutes. **More notifications went with more negative emotion.** Messages and social updates from *people* also made participants feel more connected.
- Small sample (n=15), so treat it as directional. It still supports the view that people-originated Notifications (Instructor replies) are welcomed more than automated ones.

### Medium: first-party engineering or product write-ups (not peer-reviewed, but from the team that ran the experiments)

<a id="s5"></a>**S5. LinkedIn Engineering, "Less Is More: Optimizing Email Volume", 2016** ([Part 1](https://www.linkedin.com/blog/engineering/archive/less-is-more-optimizing-email-volume-part-1), [Part 2](https://engineering.linkedin.com/blog/2016/07/less-is-more--optimizing-email-volume-part-2-), KDD'16 paper [DOI 10.1145/2939672.2939692](https://doi.org/10.1145/2939672.2939692); [2015 post](https://engineering.linkedin.com/blog/2015/10/how-experimentation-helped-linkedin-improve-email-communication))
- Halving email volume at random cut total page views by only **2.6%**. Sending everything produced **45% more negative responses** (unsubscribes and spam reports).
- An unsubscribe "lose[s] the ability to send any emails of that type to that member in the future". Spam reports can also hurt deliverability for *all* mail.
- Volume optimisation let LinkedIn send **40% less email and halve complaints** with little loss of engagement. The system lets members choose a cadence: off, per event, daily digest, weekly digest, or "recommended".

<a id="s6"></a>**S6. Jorge Mazal (former Duolingo CPO), "How Duolingo reignited user growth", Lenny's Newsletter, 2022** ([link](https://www.lennysnewsletter.com/p/how-duolingo-reignited-user-growth))
- Duolingo's founding rule was **"protect the channel"**. Teams could optimise timing, templates and copy, but could not raise notification volume "without strong justification and CEO approval".
- A cautionary tale from Groupon: adding daily emails, "even as many as five a day", caused opt-outs that persisted after the tests ended.
- The first big streak win was the **streak-saver** notification, a late-night alert when a streak is about to break. No lift figure is published.
- Retaining *current* users (CURR) moved DAU about 5 times more than any other lever. This suggests protecting the habits of active Students matters more than resurrecting dormant ones.

<a id="s7"></a>**S7. Duolingo blog, "Improving the streak"** ([link](https://blog.duolingo.com/improving-the-streak)) and **"Hi, it's Duo: the AI behind the meme"** ([link](https://blog.duolingo.com/hi-its-duo-the-ai-behind-the-meme/))
- Learners with a 7-day streak are 2.4 times more likely to return the next day. This is correlational, with obvious selection bias.
- An A/B test that let a single lesson extend a streak (instead of meeting the full daily goal) gave **D14 retention +3.3%** and DAU +1%. A low bar for "keeping it going" helps.
- Reminders are personalised by streak and language, and the best template differs between groups.

### Weak: anecdote, press, vendor surveys

- **Coursera, 2013 (press paraphrase of Andrew Ng):** "sending a homework reminder via email drives engagement down," whereas emailing praise for a student's results improved engagement ([Higher Ed Dive](https://www.highereddive.com/news/coursera-gives-a-peek-at-what-encouragement-can-do/196947/)). No data published. It points the same way as S3.
- **Coursera Engineering, "The Power of Goals" (2018):** goal setting plus goal reminders reportedly helped ([Medium](https://medium.com/coursera-engineering/the-power-of-goals-a5134b8d0e1f)). The page could not be fetched (403), so these figures are unverified.
- **Localytics 2017 survey (via vendors):** about 10% of users say they would disable an app's push at 1 a week, 37% at 2–5 a week, and 33% at 6–10 a week ([Business of Apps](https://www.businessofapps.com/marketplace/push-notifications/research/push-notifications-statistics/)). This is stated intent from a vendor survey, not measured behaviour. Braze's opt-out survey says it is not statistically significant ([Braze](https://www.braze.com/resources/articles/opt-out-of-push-notifications-why-users-do-it)).
- **Instructor forum participation and dropout:** the evidence is mixed. Zhang, Chen & Phang found no completion difference with instructor forum interaction. Du et al. found instructor *posting* engaged students more than *replying* ([Springer](https://link.springer.com/article/10.1007/s10639-022-11270-7), [Hawaii ScholarSpace](https://scholarspace.manoa.hawaii.edu/items/7889ab2c-73fb-4a6d-a85c-3ea39fc094c9)). No study isolates *notifying* the Student of a reply. The case for reply Notifications rests on S4 (people-originated messages are valued) and on common sense: the Student asked a question and is waiting for the answer.
- **Milestones and the goal-gradient effect:** effort speeds up as people near a goal, and "illusionary progress" (a head start) speeds completion ([Kivetz, Urminsky & Zheng, JMR 2006](https://business.columbia.edu/faculty/research/goal-gradient-hypothesis-resurrected-purchase-acceleration-illusionary-goal)). This is strong behavioural evidence but comes from loyalty programs, not learning Notifications. It supports "you're 80% through *Course X*" more than "you finished lesson 3".

## By Notification kind

| Kind | Evidence | Verdict for Cadence |
| --- | --- | --- |
| **Instructor reply to the Student's comment** | Indirect (S4, plus the Student is already waiting). No direct RCT. | Strongest candidate. Real, person-originated, expected. |
| **Inactivity nudge** ("pick up where you left off") | S1 small but real. S3 helps lapsed Students, may hurt active ones. S2 small effects. | Worth it **only** for lapsed Students, rarely, with a hard stop. |
| **Progress milestone** (e.g. 50% or 90% of a Course, Course complete) | Goal-gradient (indirect). Coursera praise anecdote. | Good. Low volume by nature. Emphasise nearness to finishing. |
| **New content in an enrolled Course** | No direct evidence found. It is event-driven and relevant, so it fits LinkedIn's "real event" model. | Good, batched into a digest if frequent. |
| **Streaks / streak-saver** | Duolingo evidence is strong *for a daily-habit product*. Cadence is self-paced video, so daily streaks fit poorly. | Defer. If tried, use a weekly streak with a low bar (S7). |
| **Generic "homework" reminders** | Coursera anecdote and S3 US data point to null or negative effects. | Avoid. |

## Timing and frequency

- **Gate on state, not on the calendar.** Nudge only after a gap in activity (no lesson progress for N days). Never nudge a Student who was active in that window (S3).
- **Front-load for new Students.** Gains are largest while habits are forming (S1 new-user retention +2%).
- **Vary the copy.** The novelty effect decays over weeks (S1, 15-day half-life). Rotate templates and avoid sending identical text.
- **Cap volume and treat opt-outs as permanent loss** (S5, S6). Measure unsubscribes and disables alongside returns, not opens (S3: opens did not predict return).
- **Give Students control:** per-kind toggles and digest options (per event, daily, weekly, off), as LinkedIn does (S5).
- No high-trust source gives a universal "N per week" threshold. The survey figures (about 10% would opt out at 1 a week, rising steeply at 2+) are weak evidence but consistent with the direction of S5.

## Ranked shortlist for Cadence

1. **Instructor replied to your comment.** In-app immediately. Email at most one digest a day, and skip the email if the Student has already seen it in-app.
2. **New lesson or module added to a Course you're enrolled in.** In-app always. Email batched to at most 1 a week for each Student, across all Courses.
3. **Milestone reached / nearly there** (50%, 90%, Course complete). In-app always. Email only for "almost done" and "complete", so at most 2 per Enrollment.
4. **Lapsed-Student nudge** ("Continue *Course X* at *Lesson Y*"). Email only, sent after 7 days with no lesson progress. Send at most 3 per lapse (for example day 7, day 21, day 45), then stop until the Student returns. Never send to Students active in the last 7 days. Rotate the copy.
5. **(Deferred) weekly streak / streak-saver.** Only after 1–4 are measured, and only with a low bar of one lesson a week.

**Global cap (suggested starting point, to be tuned by experiment):** no more than **2 non-reply emails a week** for each Student. Instructor reply Notifications are exempt, but each Student gets at most one reply digest a day. In-app Notifications are uncapped but grouped. Track return within 48h and unsubscribe rate for each kind, and shut off any kind whose unsubscribe rate rises without a matching rise in returns.

## Gaps

- No high-trust study isolates the effect of notifying a Student about an Instructor reply or about new course content.
- Khan Academy has no first-party engineering write-up on notification experiments that we could find.
- The unsubscribe thresholds from surveys are vendor-sourced. Cadence should measure its own.
