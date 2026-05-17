import { type MetaFunction } from "react-router";

const FAQS = [
  {
    q: "What makes Tanmatra meals 'clinical-grade'?",
    a: "Every dish on the Tanmatra menu is formulated by qualified registered dietitians (RDs) and macro-calibrated to specific therapeutic targets — protein, fibre, glycaemic load, sodium, and caloric density. Meals are prepared in FSSAI-licensed, ISO 22000-certified kitchens without preservatives or artificial flavours.",
  },
  {
    q: "Who designs the meal plans?",
    a: "Our in-house team of registered dietitians develops and reviews each recipe. When you book a 1-on-1 consultation, a dedicated RD reviews your health profile and builds a personalised plan tailored to your goals and any therapeutic protocols (Wellness, Performance, or Clinical).",
  },
  {
    q: "Can I order if I have a specific medical condition (diabetes, hypertension, IBS)?",
    a: "Yes. Tanmatra offers condition-specific therapeutic protocols. However, our meals are designed as adjuncts to medical care — they do not replace treatment prescribed by your doctor. Always consult your physician before beginning any therapeutic nutrition programme.",
  },
  {
    q: "How do I check if Tanmatra delivers to my area?",
    a: "Enter your pincode on the home or checkout page. Delivery is currently available across select areas of Bengaluru; we are expanding regularly. If your area is not yet served, you can join the waitlist.",
  },
  {
    q: "What are the delivery timings?",
    a: "Fresh meals are dispatched for same-day delivery. Ordering by 10 AM typically ensures delivery by lunch; by 2 PM for dinner. Exact windows are shown at checkout based on your delivery address.",
  },
  {
    q: "Can I subscribe to a weekly meal plan?",
    a: "Yes. Weekly plans let you pre-select meals for the week at a discounted rate. Plans auto-renew unless cancelled at least 24 hours before the next cycle. You can pause, skip, or modify meals from the Subscriptions page.",
  },
  {
    q: "What payment methods do you accept?",
    a: "We accept all major UPI apps (Google Pay, PhonePe, Paytm), debit/credit cards, net banking, popular wallets, and cash on delivery. Payments are processed securely via Razorpay (PCI-DSS Level 1 certified). Tanmatra never sees or stores your card or UPI credentials.",
  },
  {
    q: "Do I need an account to order?",
    a: "Browsing the menu and checking prices does not require an account. An account is needed to place an order so we can track delivery and order history for you. Sign-up takes under 60 seconds.",
  },
  {
    q: "What is your refund and cancellation policy?",
    a: "Orders can be cancelled within 30 minutes of placement for a full refund. After that, cancellations are assessed case-by-case. Meals that arrive damaged or incorrect are replaced or refunded — contact us via the Support tab within 2 hours of delivery.",
  },
  {
    q: "Are the meals suitable for vegans / vegetarians?",
    a: "The menu is clearly tagged: Vegan, Vegetarian, Egg, Poultry, Seafood, and Meat. You can filter by dietary preference on the Menu page. All vegan and vegetarian items are prepared on dedicated equipment to avoid cross-contact.",
  },
];

export const meta: MetaFunction = () => [
  { title: "FAQ | Tanmatra" },
  { name: "description", content: "Frequently asked questions about Tanmatra's clinical meal delivery — ordering, delivery, plans, ingredients, and refunds." },
  { property: "og:title", content: "FAQ | Tanmatra" },
  { property: "og:url", content: "https://tanmatra.food/faq" },
  {
    "script:ld+json": {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": FAQS.map(({ q, a }) => ({
        "@type": "Question",
        "name": q,
        "acceptedAnswer": { "@type": "Answer", "text": a },
      })),
    },
  },
];

export default function Faq() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-3xl text-white font-serif mb-2">Frequently Asked Questions</h1>
      <p className="text-clinical-zinc text-sm mb-10">Everything you need to know about ordering, delivery, and our therapeutic meal programme.</p>
      <div className="space-y-6">
        {FAQS.map(({ q, a }) => (
          <div key={q} className="border border-clinical-border rounded-lg p-5 bg-clinical-surface">
            <h2 className="text-base font-semibold text-white mb-2">{q}</h2>
            <p className="text-sm text-clinical-zinc leading-relaxed">{a}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
