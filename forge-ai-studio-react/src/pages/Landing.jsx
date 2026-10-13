import { Logo } from '../components/Logo'
import { ParticleField } from '../components/ParticleField'

export function Landing({ onGetStarted, onTerms }) {
  return (
    <div className="min-h-screen bg-background text-on-background selection:bg-primary/30 overflow-x-hidden" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* TopNavBar */}
      <header className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-md border-b border-outline-variant/20 transition-all duration-200 ease-in-out">
        <div className="flex justify-between items-center px-margin-mobile md:px-margin-desktop h-16 max-w-[1280px] mx-auto w-full">
          <button onClick={onGetStarted} className="flex items-center gap-2.5 h-10 group" aria-label="Vux AI Studio home">
            <Logo className="h-8 w-8 transition-transform duration-300 group-hover:scale-105" />
            <span className="flex flex-col items-start leading-none">
              <span className="font-display font-bold text-base tracking-tight text-on-background">VUX</span>
              <span className="text-[10px] tracking-[0.2em] text-on-surface-variant">AI STUDIO</span>
            </span>
          </button>
          
          <nav className="hidden md:flex gap-lg">
            <a className="text-on-surface-variant hover:text-primary transition-colors duration-200" href="#">Platform</a>
            <a className="text-on-surface-variant hover:text-primary transition-colors duration-200" href="#">Solutions</a>
            <a className="text-on-surface-variant hover:text-primary transition-colors duration-200" href="#">Resources</a>
            <a className="text-on-surface-variant hover:text-primary transition-colors duration-200" href="#">Pricing</a>
          </nav>
          
          <div className="hidden md:flex items-center gap-md">
            <button 
              onClick={onGetStarted}
              className="btn-primary"
            >
              Sign up
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow flex flex-col justify-center items-center px-margin-mobile md:px-margin-desktop py-2xl lg:py-[120px] pt-[120px] max-w-[1280px] mx-auto w-full relative">
        {/* Background decorative elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
          <ParticleField className="absolute inset-0 h-full w-full opacity-70" />
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl"></div>
          <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-surface-container/50 rounded-full blur-3xl"></div>
        </div>

        <div className="text-center max-w-3xl flex flex-col items-center">
          {/* Launch Badge */}
          <a 
            className="inline-flex items-center gap-xs px-sm py-xs rounded-full border border-surface-variant bg-surface-container-low text-on-surface-variant font-label-caps mb-lg hover:border-primary/50 hover:text-primary transition-colors"
            href="#"
          >
            Read our launch article
            <span className="material-symbols-outlined text-[14px]">arrow_right_alt</span>
          </a>

          {/* Animated Hero Title */}
          <h1 className="font-headline-xl text-headline-xl mb-lg flex flex-col items-center w-full">
            <span className="">Build the future</span>
            <span className="hero-title-container text-primary font-bold mt-2">
              <span className="rotating-word">amazing</span>
              <span className="rotating-word">new</span>
              <span className="rotating-word">wonderful</span>
              <span className="rotating-word">beautiful</span>
              <span className="rotating-word">smart</span>
            </span>
          </h1>

          {/* Body Text */}
          <p className="font-body-lg text-body-lg text-on-surface-variant mb-xl max-w-2xl">
            Your intelligent workspace for turning ideas into code, solving complex problems, and building faster with AI. Think less about the code. Create more of what matters.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-md justify-center">
            <button 
              onClick={onGetStarted}
              className="btn-primary gap-sm"
            >
              Sign up here
              <span className="material-symbols-outlined text-[18px]">arrow_right_alt</span>
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-lg bg-surface-container-lowest border-t border-outline-variant/10">
        <div className="flex flex-col md:flex-row justify-between items-center px-margin-desktop max-w-[1280px] mx-auto gap-md font-body-sm text-body-sm text-primary">
          <div className="font-headline-sm text-headline-sm font-bold text-on-background">Vux AI Studio</div>
          <div className="text-on-surface-variant">© 2024 Vux AI Studio Inc. All rights reserved.</div>
          <div className="flex gap-md">
            <a className="text-on-surface-variant hover:text-primary transition-colors" href="#">Privacy Policy</a>
            <button onClick={onTerms} className="text-on-surface-variant hover:text-primary transition-colors">Terms of Service</button>
            <a className="text-on-surface-variant hover:text-primary transition-colors" href="#">Security</a>
            <a className="text-on-surface-variant hover:text-primary transition-colors" href="#">Status</a>
          </div>
        </div>
      </footer>
    </div>
  )
}