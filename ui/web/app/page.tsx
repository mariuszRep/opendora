'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'motion/react'
import { 
  Terminal, 
  Globe, 
  Cpu, 
  Shield, 
  Zap, 
  Code2, 
  MessageSquare, 
  ChevronRight,
  X,
  CheckCircle2,
  ArrowRight,
  Layers,
  Bot,
  Database,
  Server,
  Sparkles
} from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Navigation Component
function Navigation() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/40">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20 group-hover:shadow-amber-500/40 transition-shadow">
              <Terminal className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">OpenDora</span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-8">
            <NavLink href="#what-is">What is it</NavLink>
            <NavLink href="#how-it-works">How it works</NavLink>
            <NavLink href="#capabilities">Capabilities</NavLink>
            <NavLink href="#contact">Contact</NavLink>
          </div>

          {/* CTA */}
          <div className="hidden md:flex items-center gap-3">
            <Link href="/dashboard" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Sign in
            </Link>
            <Link href="/dashboard">
              <Button size="sm" className="bg-foreground text-background hover:bg-foreground/90">
                Open App
              </Button>
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button 
            className="md:hidden p-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <div className="w-5 h-4 flex flex-col justify-between">
              <span className={cn("w-full h-0.5 bg-foreground transition-transform", mobileMenuOpen && "rotate-45 translate-y-1.5")} />
              <span className={cn("w-full h-0.5 bg-foreground transition-opacity", mobileMenuOpen && "opacity-0")} />
              <span className={cn("w-full h-0.5 bg-foreground transition-transform", mobileMenuOpen && "-rotate-45 -translate-y-1.5")} />
            </div>
          </button>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden py-4 border-t border-border/40"
            >
              <div className="flex flex-col gap-4">
                <MobileNavLink href="#what-is" onClick={() => setMobileMenuOpen(false)}>What is it</MobileNavLink>
                <MobileNavLink href="#how-it-works" onClick={() => setMobileMenuOpen(false)}>How it works</MobileNavLink>
                <MobileNavLink href="#capabilities" onClick={() => setMobileMenuOpen(false)}>Capabilities</MobileNavLink>
                <MobileNavLink href="#contact" onClick={() => setMobileMenuOpen(false)}>Contact</MobileNavLink>
                <div className="flex flex-col gap-2 pt-2">
                  <Link href="/dashboard" className="text-center py-2 text-muted-foreground">
                    Sign in
                  </Link>
                  <Link href="/dashboard" className="text-center">
                    <Button className="w-full">Open App</Button>
                  </Link>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>
    </header>
  )
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a 
      href={href} 
      className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors relative group"
    >
      {children}
      <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-foreground group-hover:w-full transition-all duration-300" />
    </a>
  )
}

function MobileNavLink({ href, onClick, children }: { href: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <a 
      href={href} 
      onClick={onClick}
      className="text-base font-medium text-foreground py-2"
    >
      {children}
    </a>
  )
}

// Hero Section
function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
      {/* Background Effects */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-100/30 via-background to-background" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl" />
        {/* Grid pattern */}
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)`,
            backgroundSize: '64px 64px'
          }}
        />
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Badge */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-sm mb-8"
        >
          <Sparkles className="w-4 h-4" />
          <span>AI-powered development tool with TUI and API</span>
        </motion.div>

        {/* Headline */}
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6"
        >
          <span className="block">Your development</span>
          <span className="block bg-gradient-to-r from-amber-600 via-orange-600 to-amber-600 bg-clip-text text-transparent">
            assistant, evolved
          </span>
        </motion.h1>

        {/* Subheadline */}
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed"
        >
          OpenDora brings AI-assisted development to your terminal and browser. 
          Build faster with intelligent agents, flexible sessions, and a complete API 
          for custom integrations.
        </motion.p>

        {/* CTAs */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Link href="/dashboard">
            <Button size="lg" className="h-12 px-8 text-base bg-foreground text-background hover:bg-foreground/90 gap-2">
              Start Building
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
          <Link href="#how-it-works">
            <Button size="lg" variant="outline" className="h-12 px-8 text-base gap-2">
              See How It Works
            </Button>
          </Link>
        </motion.div>

        {/* Terminal Preview */}
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="mt-16 relative"
        >
          <div className="relative rounded-xl bg-card border border-border shadow-2xl overflow-hidden">
            {/* Terminal Header */}
            <div className="flex items-center gap-2 px-4 py-3 bg-muted/50 border-b border-border">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-amber-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
              <span className="ml-2 text-xs text-muted-foreground font-mono">opendora</span>
            </div>
            {/* Terminal Content */}
            <div className="p-6 font-mono text-sm text-left">
              <div className="flex gap-2 mb-2">
                <span className="text-amber-500">❯</span>
                <span>Help me build a REST API endpoint</span>
              </div>
              <div className="text-muted-foreground mb-4">
                <span className="text-green-500">✓</span> Analyzing your request...
                <br />
                <span className="text-green-500">✓</span> Found 3 relevant files in your project
                <br />
                <span className="text-blue-500">→</span> Creating endpoint handler...
              </div>
              <div className="text-green-400">
                <span className="text-amber-500">❯</span> <span className="text-muted-foreground">Done! Created 2 new files.</span>
              </div>
            </div>
          </div>
          
          {/* Floating elements */}
          <div className="absolute -top-4 -right-4 p-3 bg-card rounded-lg border border-border shadow-lg animate-bounce" style={{ animationDuration: '3s' }}>
            <Bot className="w-5 h-5 text-amber-500" />
          </div>
          <div className="absolute -bottom-4 -left-4 p-3 bg-card rounded-lg border border-border shadow-lg" style={{ animation: 'float 4s ease-in-out infinite', animationDelay: '1s' }}>
            <Zap className="w-5 h-5 text-orange-500" />
          </div>
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <div className="w-6 h-10 rounded-full border-2 border-muted-foreground/30 flex items-start justify-center p-2">
          <motion.div 
            animate={{ y: [0, 12, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="w-1 h-2 bg-muted-foreground/50 rounded-full"
          />
        </div>
      </motion.div>
    </section>
  )
}

// What is OpenDora Section
function WhatIsOpenDora() {
  return (
    <section id="what-is" className="py-24 lg:py-32 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">What is OpenDora?</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            An AI-powered development tool that gives you a powerful terminal interface 
            and a complete API for building custom workflows.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          <FeatureCard 
            icon={Terminal}
            title="Terminal UI"
            description="Full-featured TUI with syntax highlighting, autocomplete, and rich formatting. Work efficiently in your terminal."
          />
          <FeatureCard 
            icon={Globe}
            title="Web API"
            description="RESTful API with streaming responses. Build web interfaces, IDE extensions, or integrate with existing tools."
          />
          <FeatureCard 
            icon={Cpu}
            title="AI Agents"
            description="Configurable agents with permission controls. Define what they can read, write, and execute."
          />
        </div>

        <div className="mt-16 p-8 rounded-2xl bg-card border border-border">
          <div className="grid lg:grid-cols-2 gap-8 items-center">
            <div>
              <h3 className="text-2xl font-bold mb-4">Built on solid foundations</h3>
              <p className="text-muted-foreground mb-6">
                OpenDora is a fork of OpenCode, enhanced with a modular architecture. 
                It separates concerns into dedicated packages for agents, sessions, providers, 
                tools, and permissions — giving you flexibility and control.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  <span>Multiple LLM provider support (OpenAI, Anthropic, Google, and more)</span>
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  <span>Session-based conversations with memory management</span>
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  <span>Extensible tool system with permission controls</span>
                </li>
              </ul>
            </div>
            <div className="relative">
              <div className="p-6 rounded-xl bg-muted/50 border border-border font-mono text-sm">
                <div className="flex items-center gap-2 mb-4 text-muted-foreground">
                  <Layers className="w-4 h-4" />
                  <span>Architecture</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                    <span>core/ — binary, CLI, TUI, server</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-orange-500" />
                    <span>packages/agent — agent loop & orchestration</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span>packages/session — memory & streaming</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <span>packages/provider — LLM abstractions</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-purple-500" />
                    <span>packages/tools — executable functions</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-pink-500" />
                    <span>packages/permission — access control</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function FeatureCard({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="p-6 rounded-xl bg-card border border-border hover:border-amber-500/30 transition-colors group">
      <div className="w-12 h-12 rounded-lg bg-amber-500/10 flex items-center justify-center mb-4 group-hover:bg-amber-500/20 transition-colors">
        <Icon className="w-6 h-6 text-amber-600" />
      </div>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  )
}

// How It Works Section
function HowItWorks() {
  const steps = [
    {
      number: '01',
      title: 'Start the server',
      description: 'Run `bun run dev` to launch the TUI, or `bun run serve` for API-only mode. The server runs on localhost:4096.',
      icon: Server
    },
    {
      number: '02',
      title: 'Configure your provider',
      description: 'Set your API keys via environment variables. OpenDora supports OpenAI, Anthropic, Google, and other providers.',
      icon: Database
    },
    {
      number: '03',
      title: 'Create a session',
      description: 'Start a new session to begin a conversation. Each session maintains its own context and history.',
      icon: MessageSquare
    },
    {
      number: '04',
      title: 'Build with AI assistance',
      description: 'Describe what you want to build. OpenDora analyzes your project, suggests changes, and can execute them.',
      icon: Code2
    }
  ]

  return (
    <section id="how-it-works" className="py-24 lg:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">How It Works</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Get started in minutes. OpenDora is designed to be simple to run 
            but powerful enough for complex workflows.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((step, index) => (
            <div key={index} className="relative">
              <div className="p-6 rounded-xl bg-card border border-border h-full">
                <div className="text-6xl font-bold text-amber-500/20 mb-4">{step.number}</div>
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center mb-4">
                  <step.icon className="w-5 h-5 text-amber-600" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </div>
              {index < steps.length - 1 && (
                <div className="hidden lg:block absolute top-1/2 -right-3 transform -translate-y-1/2">
                  <ChevronRight className="w-6 h-6 text-muted-foreground/30" />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-16 text-center">
          <div className="inline-flex items-center gap-4 p-4 rounded-xl bg-muted/50 border border-border">
            <Code2 className="w-5 h-5 text-amber-500" />
            <code className="text-sm font-mono">bun run dev</code>
            <span className="text-muted-foreground text-sm">or</span>
            <code className="text-sm font-mono">bun run serve</code>
          </div>
        </div>
      </div>
    </section>
  )
}

// Capabilities Section
function Capabilities() {
  const capabilities = [
    {
      title: 'Multiple Operating Modes',
      description: 'Interactive TUI, headless server, remote attach, or scriptable CLI — choose what fits your workflow.',
      icon: Layers
    },
    {
      title: 'Flexible Storage',
      description: 'JSONL, SQLite, or PostgreSQL adapters. Swap storage backends with a single config change.',
      icon: Database
    },
    {
      title: 'Permission System',
      description: 'Fine-grained access controls. Define what agents can read, write, and execute in your projects.',
      icon: Shield
    },
    {
      title: 'Streaming Responses',
      description: 'Real-time token-by-token streaming for both TUI and API. See thinking as it happens.',
      icon: Zap
    },
    {
      title: 'Tool Execution',
      description: 'Built-in tools for file operations, shell commands, web fetching, and more. Extendable system.',
      icon: Cpu
    },
    {
      title: 'Provider Agnostic',
      description: 'Use any LLM provider. OpenAI, Anthropic, Google, or bring your own. Same interface for all.',
      icon: Bot
    }
  ]

  return (
    <section id="capabilities" className="py-24 lg:py-32 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">Key Capabilities</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Everything you need for AI-assisted development, with the flexibility 
            to customize for your specific needs.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {capabilities.map((cap, index) => (
            <div 
              key={index}
              className="p-6 rounded-xl bg-card border border-border hover:border-amber-500/30 transition-all hover:shadow-lg hover:shadow-amber-500/5"
            >
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center mb-4">
                <cap.icon className="w-5 h-5 text-amber-600" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{cap.title}</h3>
              <p className="text-sm text-muted-foreground">{cap.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// Contact Section
function Contact() {
  const [formState, setFormState] = useState<'idle' | 'submitting' | 'success'>('idle')
  const [formData, setFormData] = useState({ name: '', email: '', message: '' })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormState('submitting')
    
    // Simulate form submission
    await new Promise(resolve => setTimeout(resolve, 1500))
    setFormState('success')
  }

  return (
    <section id="contact" className="py-24 lg:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16">
          {/* Left side - Info */}
          <div>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Get in Touch</h2>
            <p className="text-lg text-muted-foreground mb-8">
              Interested in OpenDora? Have questions about integration or deployment? 
              We'd love to hear from you.
            </p>

            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                  <MessageSquare className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">General Inquiries</h3>
                  <p className="text-muted-foreground text-sm">Questions about the project, features, or roadmap.</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                  <Code2 className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Technical Questions</h3>
                  <p className="text-muted-foreground text-sm">Integration help, API questions, deployment issues.</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                  <Globe className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Contributions</h3>
                  <p className="text-muted-foreground text-sm">Interested in contributing? Start with the GitHub repo.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right side - Form */}
          <div className="p-8 rounded-2xl bg-card border border-border">
            {formState === 'success' ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8 text-green-500" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Message Sent!</h3>
                <p className="text-muted-foreground">We'll get back to you as soon as possible.</p>
                <Button 
                  variant="outline" 
                  className="mt-6"
                  onClick={() => setFormState('idle')}
                >
                  Send another message
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium mb-2">Name</label>
                  <input
                    type="text"
                    id="name"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-colors"
                    placeholder="Your name"
                  />
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium mb-2">Email</label>
                  <input
                    type="email"
                    id="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-colors"
                    placeholder="you@example.com"
                  />
                </div>

                <div>
                  <label htmlFor="message" className="block text-sm font-medium mb-2">Message</label>
                  <textarea
                    id="message"
                    required
                    rows={5}
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-colors resize-none"
                    placeholder="Tell us about your interest in OpenDora..."
                  />
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-12"
                  disabled={formState === 'submitting'}
                >
                  {formState === 'submitting' ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                      Sending...
                    </span>
                  ) : (
                    'Send Message'
                  )}
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

// Footer
function Footer() {
  return (
    <footer className="bg-muted/30 border-t border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                <Terminal className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-lg">OpenDora</span>
            </div>
            <p className="text-muted-foreground text-sm max-w-xs">
              AI-powered development tool with terminal interface and web API. 
              Built for developers who want flexibility and control.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-semibold mb-4">Product</h4>
            <ul className="space-y-2">
              <li><a href="#what-is" className="text-sm text-muted-foreground hover:text-foreground transition-colors">What is it</a></li>
              <li><a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors">How it works</a></li>
              <li><a href="#capabilities" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Capabilities</a></li>
              <li><a href="#contact" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Contact</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Resources</h4>
            <ul className="space-y-2">
              <li><a href="https://github.com" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground transition-colors">GitHub</a></li>
              <li><a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Documentation</a></li>
              <li><a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">API Reference</a></li>
              <li><a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">License</a></li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} OpenDora. Based on OpenCode.
          </p>
          <div className="flex items-center gap-4">
            <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}

// Main Page Component
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main>
        <Hero />
        <WhatIsOpenDora />
        <HowItWorks />
        <Capabilities />
        <Contact />
      </main>
      <Footer />
    </div>
  )
}