import { Modal } from './Modal';
import { useLang } from '../hooks/useLang';
import { Info, Phone } from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HelpModal({ isOpen, onClose }: HelpModalProps) {
  const { lang } = useLang();
  
  const isDark = document.documentElement.classList.contains('dark');
  const sectionBg = isDark ? 'bg-[#1c2a42]' : 'bg-gray-50';
  const textPrimary = isDark ? 'text-gray-200' : 'text-gray-900';
  const textSecondary = isDark ? 'text-gray-400' : 'text-gray-600';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={lang === 'en' ? 'Help & Support' : 'सहायता और समर्थन'}>
      <div className="space-y-6 pt-2">
        {/* Contact Info */}
        <section>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            {lang === 'en' ? 'Contact Us' : 'संपर्क करें'}
          </h3>
          <div className={`${sectionBg} rounded-xl p-4 space-y-3`}>
            <div className="flex items-center gap-3">
              <Phone className="text-primary-500" size={18} />
              <div className="text-sm">
                <p className={`font-medium ${textPrimary}`}>1912</p>
                <p className={`text-xs ${textSecondary}`}>{lang === 'en' ? 'Toll Free Number (SBPDCL)' : 'टोल फ्री नंबर (SBPDCL)'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Phone className="text-primary-500" size={18} />
              <div className="text-sm">
                <p className={`font-medium ${textPrimary}`}>1800 3456 198</p>
                <p className={`text-xs ${textSecondary}`}>{lang === 'en' ? 'Customer Care' : 'कस्टमर केयर'}</p>
              </div>
            </div>
          </div>
        </section>

        {/* FAQs */}
        <section>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            {lang === 'en' ? 'Frequently Asked Questions' : 'अक्सर पूछे जाने वाले प्रश्न'}
          </h3>
          <div className="space-y-3">
            {[
              {
                q: lang === 'en' ? 'How does the auto-fill work?' : 'ऑटो-फिल कैसे काम करता है?',
                a: lang === 'en' ? 'When you tap recharge, the app securely opens the official SBPDCL website and automatically types your CA Number and Amount to save you time.' : 'जब आप रिचार्ज पर टैप करते हैं, तो ऐप सुरक्षित रूप से आधिकारिक SBPDCL वेबसाइट खोलता है और आपका CA नंबर और राशि स्वचालित रूप से टाइप करता है।'
              },
              {
                q: lang === 'en' ? 'Is my payment information safe?' : 'क्या मेरी भुगतान जानकारी सुरक्षित है?',
                a: lang === 'en' ? 'Yes! We never store your payment details, passwords, or UPI pins. All payments are processed on the official SBPDCL secure gateway.' : 'हाँ! हम कभी भी आपके भुगतान विवरण, पासवर्ड या UPI पिन को संग्रहीत नहीं करते हैं। सभी भुगतान आधिकारिक SBPDCL सुरक्षित गेटवे पर संसाधित किए जाते हैं।'
              },
              {
                q: lang === 'en' ? 'Can I save multiple meters?' : 'क्या मैं एक से अधिक मीटर सेव कर सकता हूँ?',
                a: lang === 'en' ? 'Yes, you can save as many CA Numbers as you like (e.g., Home, Shop, Parents) and switch between them easily.' : 'हाँ, आप जितने चाहें उतने CA नंबर सेव कर सकते हैं (जैसे, घर, दुकान, माता-पिता) और उनके बीच आसानी से स्विच कर सकते हैं।'
              }
            ].map((faq, i) => (
              <div key={i} className={`${sectionBg} rounded-xl p-4`}>
                <p className={`text-sm font-semibold mb-1 ${textPrimary}`}>{faq.q}</p>
                <p className={`text-xs leading-relaxed ${textSecondary}`}>{faq.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* App Info */}
        <section>
          <div className={`${sectionBg} rounded-xl p-4 flex gap-3 items-start`}>
            <Info className="text-blue-500 flex-shrink-0 mt-0.5" size={18} />
            <p className={`text-xs leading-relaxed ${textSecondary}`}>
              {lang === 'en' 
                ? 'This is an independent utility app designed to make your South Bihar electricity recharge experience faster and simpler. It is not an officially commissioned app by SBPDCL.' 
                : 'यह एक स्वतंत्र उपयोगिता ऐप है जिसे आपके दक्षिण बिहार बिजली रिचार्ज अनुभव को तेज और सरल बनाने के लिए डिज़ाइन किया गया है। यह SBPDCL द्वारा आधिकारिक तौर पर चालू किया गया ऐप नहीं है।'}
            </p>
          </div>
        </section>
      </div>
    </Modal>
  );
}
