"use client";
/**
 * App first-run tour (Sagar polish list). Four cards, once ever per device
 * (localStorage flag). The open check lives inside a timeout WITH a re-check
 * of the flag — the prototype taught us a fast Skip can otherwise race a
 * queued open and re-show the tour it just closed.
 */
import { useEffect, useState } from "react";

const TOUR_KEY = "baskit.app.tourDone";

const STEPS = [
  {
    icon: "🧺",
    title: "Everything you want, in one place",
    body: "Paste a product link and Baskit reads the name, price and photo for you. On your phone, share straight from any store app once Baskit is installed.",
  },
  {
    icon: "🎯",
    title: "The score does the thinking",
    body: "Every item gets a buy-or-wait score from price drops, targets, cool-offs and your budget. Impulse buys get a built-in pause.",
  },
  {
    icon: "💷",
    title: "Budgets that hold",
    body: "Segments carry spend caps, and the Budget window plans month by month. Your income and outgoings stay on this device — never uploaded.",
  },
  {
    icon: "🔔",
    title: "Moments, not noise",
    body: "Prices are checked daily while you sleep. Real drops and target hits land in the bell — turn on notifications and they ping this device.",
  },
];

export function Tour() {
  const [step, setStep] = useState<number | null>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      try {
        if (!localStorage.getItem(TOUR_KEY)) setStep(0);
      } catch {
        // storage blocked — skip the tour quietly
      }
    }, 400);
    return () => clearTimeout(id);
  }, []);

  if (step === null) return null;

  const done = () => {
    try {
      localStorage.setItem(TOUR_KEY, "1");
    } catch {
      // fine — it just shows again next visit
    }
    setStep(null);
  };

  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <>
      <div className="overlay open" style={{ zIndex: 90 }} onClick={done} />
      <div className="tourcard" role="dialog" aria-label="Welcome tour">
        <div className="tc-ico">{s.icon}</div>
        <h3>{s.title}</h3>
        <p>{s.body}</p>
        <div className="tc-dots">
          {STEPS.map((_, i) => (
            <span key={i} className={i === step ? "on" : ""} />
          ))}
        </div>
        <div className="tc-btns">
          <button className="btn ghost sm" onClick={done}>
            Skip
          </button>
          <button className="btn sm" onClick={() => (last ? done() : setStep(step + 1))}>
            {last ? "Start using Baskit" : "Next"}
          </button>
        </div>
      </div>
    </>
  );
}
