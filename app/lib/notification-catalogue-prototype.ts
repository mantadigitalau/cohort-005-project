// PROTOTYPE — sample Notifications from the v1 catalogue (wayfinder ticket #16),
// shaped as the `data` payload sent to Knock's `prototype-notification` workflow.
// Shared by the seed script and the "send one to me" button.

export type NotificationKind =
  | "refund_requested"
  | "refund_approved"
  | "refund_declined"
  | "seat_claimed"
  | "new_question"
  | "comment_reply";

export interface NotificationData {
  kind: NotificationKind;
  /** One line, **bold** marks the course/lesson name. */
  body: string;
  /** Optional second line: refund reason, decision note, comment excerpt. */
  detail?: string;
  /** Where clicking the Notification takes you. */
  url: string;
  actor_name?: string;
}

export interface SampleNotification {
  recipientIds: number[];
  actorId?: number;
  data: NotificationData;
}

// Seed users: 1 Alex Rivera (Platform Admin), 2 Sarah Chen (Instructor),
// 5 Emma Wilson / 6 James Park / 7 Olivia Martinez / 8 Liam Thompson (Students),
// 10 Bossy McBossface (Team Admin).
export const SAMPLE_NOTIFICATIONS: SampleNotification[] = [
  {
    recipientIds: [1],
    actorId: 5,
    data: {
      kind: "refund_requested",
      body: "Emma Wilson requested a refund for **Introduction to TypeScript**",
      detail: "“The pace was too fast for me, I'd like to try a beginner course first.”",
      url: "/admin/refunds",
      actor_name: "Emma Wilson",
    },
  },
  {
    recipientIds: [1],
    actorId: 6,
    data: {
      kind: "refund_requested",
      body: "James Park requested a refund for **Building REST APIs with Node.js**",
      detail: "“Bought the wrong course by mistake.”",
      url: "/admin/refunds",
      actor_name: "James Park",
    },
  },
  {
    recipientIds: [5],
    actorId: 1,
    data: {
      kind: "refund_approved",
      body: "Your refund for **Introduction to TypeScript**, $49.00, was approved",
      detail: "You no longer have access to this course.",
      url: "/courses/introduction-to-typescript",
      actor_name: "Alex Rivera",
    },
  },
  {
    recipientIds: [6],
    actorId: 1,
    data: {
      kind: "refund_declined",
      body: "Your refund request for **Building REST APIs with Node.js** was declined",
      detail: "“You've watched most of the course, so it's past the Watch Limit.”",
      url: "/courses/building-rest-apis-with-nodejs",
      actor_name: "Alex Rivera",
    },
  },
  {
    recipientIds: [10],
    actorId: 7,
    data: {
      kind: "seat_claimed",
      body: "Olivia Martinez claimed a Seat on **Introduction to TypeScript** (3 of 10 claimed)",
      url: "/team",
      actor_name: "Olivia Martinez",
    },
  },
  {
    recipientIds: [10],
    actorId: 8,
    data: {
      kind: "seat_claimed",
      body: "Liam Thompson claimed a Seat on **Introduction to TypeScript** (4 of 10 claimed)",
      url: "/team",
      actor_name: "Liam Thompson",
    },
  },
  {
    recipientIds: [2],
    actorId: 7,
    data: {
      kind: "new_question",
      body: "Olivia Martinez asked a question on **What is TypeScript?**",
      detail: "“Is TypeScript worth it for a small solo project?”",
      url: "/courses/introduction-to-typescript/lessons/1",
      actor_name: "Olivia Martinez",
    },
  },
  {
    recipientIds: [2],
    actorId: 8,
    data: {
      kind: "comment_reply",
      body: "Liam Thompson replied to your comment on **Primitive Types**",
      detail: "“That cleared it up, thanks!”",
      url: "/courses/introduction-to-typescript/lessons/4",
      actor_name: "Liam Thompson",
    },
  },
  {
    recipientIds: [7],
    actorId: 2,
    data: {
      kind: "comment_reply",
      body: "Sarah Chen replied to your comment on **What is TypeScript?**",
      detail: "“For a solo project it still pays off once it grows past a few files.”",
      url: "/courses/introduction-to-typescript/lessons/1",
      actor_name: "Sarah Chen",
    },
  },
];
