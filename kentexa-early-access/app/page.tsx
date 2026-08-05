import HeroSection from '@/components/landing/HeroSection';
import BenefitsGrid from '@/components/landing/BenefitsGrid';
import StatsCounter from '@/components/landing/StatsCounter';
import CtaBanner from '@/components/landing/CtaBanner';
import Footer from '@/components/landing/Footer';

export default function LandingPage() {
  return (
    <main>
      <HeroSection />
      <StatsCounter />
      <BenefitsGrid />
      <CtaBanner />
      <Footer />
    </main>
  );
}
