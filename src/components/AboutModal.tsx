import { Modal } from './Modal';
import { Button } from './Button';
import { Shield, Smartphone, Zap, ExternalLink, Info, Lock } from 'lucide-react';

const APP_VERSION = 'v1.2';
const PORTAL_URL = 'https://wss.sbpdcl.co.in/cportal/';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Passed in rather than read from useLang(): that hook owns its own state,
      so a second instance here would not follow the language toggle. */
  lang: 'en' | 'hi';
}

/** Everything stored on the device, by the key it is stored under. Listing the
    real keys keeps this page honest — if storage grows, this list has to grow
    with it, which is easier to notice than a vague "we store some settings". */
const STORED = {
  en: [
    ['sbpdcl_consumers', 'The meters you saved — CA number, nickname, mobile number, and the last balance fetched.'],
    ['sbpdcl_settings', 'Your preferences: theme, text size, low-balance alerts, biometric lock.'],
    ['app_lang', 'Whether you chose English or Hindi.'],
    ['onboarding_done_v1', 'Whether the intro screens have been seen.'],
    ['pwa_prompt_dismissed', 'Whether you dismissed the "install app" prompt.'],
  ],
  hi: [
    ['sbpdcl_consumers', 'आपके सहेजे गए मीटर — CA नंबर, नाम, मोबाइल नंबर और अंतिम प्राप्त बैलेंस।'],
    ['sbpdcl_settings', 'आपकी पसंद: थीम, टेक्स्ट का आकार, कम बैलेंस अलर्ट, बायोमेट्रिक लॉक।'],
    ['app_lang', 'आपने अंग्रेज़ी चुनी या हिंदी।'],
    ['onboarding_done_v1', 'परिचय स्क्रीन देखी गई या नहीं।'],
    ['pwa_prompt_dismissed', 'आपने "ऐप इंस्टॉल करें" सूचना बंद की या नहीं।'],
  ],
};

const COPY = {
  en: {
    title: 'About',
    whatTitle: 'What this app is',
    what: 'Bijli Recharge is a faster way to check the balance on your SBPDCL prepaid electricity meters and top them up. It is built for households that look after several meters — your own, your parents\', a shop — without typing a CA number into the portal every time.',
    howTitle: 'How it works',
    how: [
      'Balances are read from the same public SBPDCL service the official portal\'s bill-search page uses. Nothing is scraped and no login is involved.',
      'Recharges are registered with SBPDCL, then the payment itself happens on SBPDCL\'s own payment gateway, in its own window.',
      'This app never sees your card, UPI PIN, or bank credentials. It cannot — the payment page belongs to the gateway, not to us.',
    ],
    privacyTitle: 'Privacy',
    privacyLead: 'There is no account, no login, and no server of ours. Everything you enter stays in your browser or phone.',
    storedTitle: 'What is stored on your device',
    noTitle: 'What is never collected',
    no: [
      'No analytics, no tracking pixels, no advertising.',
      'No copy of your CA numbers, balances, or payments on any server we run.',
      'Nothing is shared with anyone. Requests go only to SBPDCL, exactly as they would from their own website.',
    ],
    clearNote: 'Clearing your browser data, or using "Delete all data" in Settings, removes everything above permanently. There is no backup to restore from — that is the trade-off for keeping it all on your device.',
    disclaimerTitle: 'Not an official SBPDCL app',
    disclaimer: 'This is an independent tool, not affiliated with, endorsed by, or operated by South Bihar Power Distribution Company Ltd. Balance and payment information comes from SBPDCL and is only as current as their systems. For anything official — disputes, complaints, disconnection notices — use the SBPDCL portal directly.',
    portal: 'Open the official SBPDCL portal',
    close: 'Close',
  },
  hi: {
    title: 'ऐप के बारे में',
    whatTitle: 'यह ऐप क्या है',
    what: 'बिजली रिचार्ज आपके SBPDCL प्रीपेड बिजली मीटर का बैलेंस देखने और रिचार्ज करने का तेज़ तरीका है। यह उन परिवारों के लिए बनाया गया है जो कई मीटर संभालते हैं — अपना, माता-पिता का, दुकान का — हर बार पोर्टल पर CA नंबर डाले बिना।',
    howTitle: 'यह कैसे काम करता है',
    how: [
      'बैलेंस उसी सार्वजनिक SBPDCL सेवा से लिया जाता है जिसे आधिकारिक पोर्टल का बिल-सर्च पेज इस्तेमाल करता है। न कोई स्क्रैपिंग, न कोई लॉगिन।',
      'रिचार्ज SBPDCL में दर्ज होता है, और भुगतान SBPDCL के अपने पेमेंट गेटवे पर, उसकी अपनी विंडो में होता है।',
      'यह ऐप आपका कार्ड, UPI पिन या बैंक विवरण कभी नहीं देखता। देख ही नहीं सकता — भुगतान पेज गेटवे का है, हमारा नहीं।',
    ],
    privacyTitle: 'गोपनीयता',
    privacyLead: 'कोई खाता नहीं, कोई लॉगिन नहीं, और हमारा कोई सर्वर नहीं। आपकी दर्ज की हुई हर चीज़ आपके ब्राउज़र या फ़ोन में ही रहती है।',
    storedTitle: 'आपके डिवाइस पर क्या सहेजा जाता है',
    noTitle: 'क्या कभी एकत्र नहीं किया जाता',
    no: [
      'कोई एनालिटिक्स नहीं, कोई ट्रैकिंग नहीं, कोई विज्ञापन नहीं।',
      'हमारे किसी सर्वर पर आपके CA नंबर, बैलेंस या भुगतान की कोई प्रति नहीं।',
      'कुछ भी किसी के साथ साझा नहीं होता। अनुरोध केवल SBPDCL को जाते हैं, ठीक वैसे ही जैसे उनकी अपनी वेबसाइट से जाते।',
    ],
    clearNote: 'ब्राउज़र डेटा हटाने पर, या सेटिंग्स में "सारा डेटा हटाएँ" चुनने पर, ऊपर लिखी हर चीज़ हमेशा के लिए मिट जाती है। बहाल करने के लिए कोई बैकअप नहीं है — सब कुछ आपके डिवाइस पर रखने की यही कीमत है।',
    disclaimerTitle: 'यह आधिकारिक SBPDCL ऐप नहीं है',
    disclaimer: 'यह एक स्वतंत्र ऐप है, जो साउथ बिहार पावर डिस्ट्रिब्यूशन कंपनी लिमिटेड से संबद्ध, अनुमोदित या संचालित नहीं है। बैलेंस और भुगतान की जानकारी SBPDCL से आती है और उतनी ही ताज़ा होती है जितनी उनके सिस्टम में है। किसी भी आधिकारिक काम — शिकायत, विवाद, कनेक्शन कटने की सूचना — के लिए सीधे SBPDCL पोर्टल का उपयोग करें।',
    portal: 'आधिकारिक SBPDCL पोर्टल खोलें',
    close: 'बंद करें',
  },
};

function SectionHeading({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white mb-2">
      <span className="text-primary-600 dark:text-primary-400">{icon}</span>
      {children}
    </h3>
  );
}

export function AboutModal({ isOpen, onClose, lang }: AboutModalProps) {
  const c = COPY[lang];
  const stored = STORED[lang];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={c.title} maxWidth="sm:max-w-lg">
      <div className="space-y-6 text-sm leading-relaxed">

        {/* What it is */}
        <section>
          <SectionHeading icon={<Zap size={16} />}>{c.whatTitle}</SectionHeading>
          <p className="text-gray-600 dark:text-gray-300">{c.what}</p>
        </section>

        {/* How it works */}
        <section>
          <SectionHeading icon={<Smartphone size={16} />}>{c.howTitle}</SectionHeading>
          <ul className="space-y-2">
            {c.how.map((line, i) => (
              <li key={i} className="flex gap-2 text-gray-600 dark:text-gray-300">
                <span className="text-primary-500 mt-0.5 shrink-0">•</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Privacy */}
        <section className="rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 p-4">
          <SectionHeading icon={<Shield size={16} />}>{c.privacyTitle}</SectionHeading>
          <p className="text-gray-700 dark:text-gray-200 font-medium mb-3">{c.privacyLead}</p>

          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
            {c.storedTitle}
          </p>
          <ul className="space-y-1.5 mb-4">
            {stored.map(([key, desc]) => (
              <li key={key} className="text-gray-600 dark:text-gray-300 text-xs">
                <code className="font-mono text-[11px] bg-white dark:bg-slate-800 border border-emerald-200 dark:border-slate-700 rounded px-1.5 py-0.5 text-emerald-800 dark:text-emerald-300">
                  {key}
                </code>
                <span className="ml-2">{desc}</span>
              </li>
            ))}
          </ul>

          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
            {c.noTitle}
          </p>
          <ul className="space-y-1.5">
            {c.no.map((line, i) => (
              <li key={i} className="flex gap-2 text-gray-600 dark:text-gray-300 text-xs">
                <Lock size={12} className="text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                <span>{line}</span>
              </li>
            ))}
          </ul>

          <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 pt-3 border-t border-emerald-200/70 dark:border-emerald-500/20">
            {c.clearNote}
          </p>
        </section>

        {/* Disclaimer */}
        <section className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-4">
          <SectionHeading icon={<Info size={16} />}>{c.disclaimerTitle}</SectionHeading>
          <p className="text-gray-600 dark:text-gray-300 text-xs">{c.disclaimer}</p>
        </section>

        {/* Portal link + version */}
        <div className="space-y-3">
          <a
            href={PORTAL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
          >
            {c.portal} <ExternalLink size={14} />
          </a>
          <p className="text-center text-xs text-gray-400 dark:text-gray-500">
            Bijli Recharge {APP_VERSION}
          </p>
          <Button onClick={onClose} variant="secondary" className="w-full">{c.close}</Button>
        </div>
      </div>
    </Modal>
  );
}
