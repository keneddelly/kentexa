import HeroSection from '@/components/landing/HeroSection';
import BenefitsGrid from '@/components/landing/BenefitsGrid';
import FoundingCategories from '@/components/landing/FoundingCategories';
import CtaBanner from '@/components/landing/CtaBanner';
import Footer from '@/components/landing/Footer';

export default function LandingPage() {
  return (
    <main>
      <HeroSection />
      <FoundingCategories />
      <BenefitsGrid />
      <CtaBanner />
      <Footer />
    </main>
  );
}
