/**
 * BecomeSellerInfo.js
 * Shown to logged-in buyers who tap "Tuma Kifurushi"
 * Explains benefits of selling on KenteXa and guides them to apply
 *
 * Place at: src/public/pages/BecomeSellerInfo.js
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ApplyPage, InfoRows, Note, Section, K, pillStyle } from '../components/ApplyKit';

// Benefit 4 ("money held until the buyer confirms") is left out: KenteXa never holds money.
const BENEFIT_NUMBERS = [1, 2, 3, 5, 6];

const BecomeSellerInfo = ({ onNavigate }) => {
  const { t } = useTranslation();
  const strip = (x) => String(x || '').replace(/\s*(←|→)\s*$/g, '');
  return (
    <ApplyPage onBack={() => onNavigate('back')} backTitle={t('become_seller_info.page_title')}
      title={t('become_seller_info.hero_title')} desc={t('become_seller_info.hero_desc')}>
      <button type="button" onClick={() => onNavigate('BecomeSeller')} style={pillStyle()}>{t('become_seller_info.apply_button')}</button>
      <Section title={t('become_seller_info.benefits_title')}>
        <InfoRows items={BENEFIT_NUMBERS.map((n) => ({ title: t(`become_seller_info.benefit${n}_title`), desc: t(`become_seller_info.benefit${n}_desc`) }))} />
      </Section>
      <Section title={t('become_seller_info.fee_title')}>
        <Note><b>{t('become_seller_info.fee_amount')}</b>{t('become_seller_info.fee_desc')}</Note>
      </Section>
      <Section title={t('become_seller_info.steps_title')}>
        <InfoRows items={[1, 2, 3].map((n) => ({ title: t(`become_seller_info.step${n}`) }))} />
      </Section>
      <button type="button" onClick={() => onNavigate('BecomeSeller')} style={pillStyle()}>{t('become_seller_info.apply_button')}</button>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontSize: 14, color: K.MUTED }}>
        <span>{t('become_seller_info.already_seller_label')}</span>
        <button type="button" onClick={() => onNavigate('StoreSettings')}
          style={{ background: 'none', border: 'none', padding: 0, color: K.BLUE, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          {strip(t('become_seller_info.go_to_store_settings'))}
        </button>
      </div>
    </ApplyPage>
  );
};

export default BecomeSellerInfo;
