# Live Stream Setup Guide

## Prerequisites Check

### 1. Open Dora Installation
```bash
cd /home/mariu/projects/opendora
bun install
```

### 2. Verify Open Dora Works
```bash
# Test TUI mode
bun run dev

# Test API server mode
bun run serve
```

### 3. Web UI Setup
```bash
cd ui/web
bun install
bun run dev
```

## Live Stream Environment Setup

### Option 1: TUI Mode (Recommended for Dev Demo)
```bash
cd /home/mariu/projects/opendora
bun run dev
```
This starts the terminal UI with embedded server.

### Option 2: API Server + Web UI (Recommended for Visual Demo)
```bash
# Terminal 1: Start API server
cd /home/mariu/projects/opendora
bun run serve

# Terminal 2: Start web UI
cd ui/web
bun run dev
```

Access web UI at: http://localhost:3000 (or configured port)
API server at: http://localhost:4096

## Demo Project Structure

Create a test directory for the live stream:
```bash
mkdir -p ~/opendora-demo/taskflow-landing
cd ~/opendora-demo/taskflow-landing
```

## Sample Prompts for Live Stream

### Prompt 1: Initial Build
```
Create a modern landing page for TaskFlow, a project management tool. Include:
- Hero section with headline "Streamline Your Workflow"
- Features section with 3 key features: Real-time collaboration, Advanced analytics, Custom workflows
- Pricing section with 3 tiers: Free ($0), Pro ($29/mo), Enterprise ($99/mo)
- Contact form with name, email, message fields
- Modern, clean design with blue accent colors
- Fully responsive for mobile devices
```

### Prompt 2: Iteration - Add Testimonials
```
Add a testimonials section with 3 customer reviews. Include customer name, company, and quote. Make it visually appealing with star ratings.
```

### Prompt 3: Iteration - Improve Design
```
Improve the visual design by:
- Adding subtle animations on scroll
- Using a gradient background for the hero section
- Adding hover effects on buttons
- Improving the spacing and typography
```

### Prompt 4: Add Interactive Elements
```
Add:
- A mobile navigation menu that toggles on small screens
- Smooth scrolling for anchor links
- A back-to-top button
- Form validation for the contact form
```

## Screen Recording Setup

### OBS Studio Configuration
1. Scene: "Open Dora Demo"
   - Display Capture: Main monitor (IDE/terminal)
   - Window Capture: Browser preview
   - Text: "Testing Open Dora vs $1M AI Builders"

2. Audio
   - Microphone: Your main mic
   - Desktop Audio: System sounds (optional)

3. Recording Settings
   - Output: MP4
   - Quality: High
   - Bitrate: 6000 Kbps

## Backup Materials

### Pre-built Example (if Open Dora fails)
Have a simple HTML/CSS/JS landing page ready as fallback:
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TaskFlow - Streamline Your Workflow</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        .hero { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 100px 20px; text-align: center; }
        .hero h1 { font-size: 3em; margin-bottom: 20px; }
        .hero p { font-size: 1.5em; margin-bottom: 30px; }
        .btn { background: white; color: #667eea; padding: 15px 30px; border: none; border-radius: 5px; font-size: 1.2em; cursor: pointer; }
        .features { padding: 80px 20px; max-width: 1200px; margin: 0 auto; }
        .feature-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 30px; margin-top: 40px; }
        .feature { padding: 30px; border-radius: 10px; background: #f5f5f5; }
        .pricing { padding: 80px 20px; background: #f9f9f9; }
        .pricing-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 30px; max-width: 1200px; margin: 40px auto 0; }
        .price-card { padding: 40px; background: white; border-radius: 10px; text-align: center; }
        .price { font-size: 3em; color: #667eea; margin: 20px 0; }
    </style>
</head>
<body>
    <section class="hero">
        <h1>Streamline Your Workflow</h1>
        <p>The smartest way to manage projects and collaborate with your team</p>
        <button class="btn">Get Started Free</button>
    </section>
    <section class="features">
        <h2 style="text-align: center;">Why TaskFlow?</h2>
        <div class="feature-grid">
            <div class="feature">
                <h3>Real-time Collaboration</h3>
                <p>Work together seamlessly with live updates and instant sync across all devices.</p>
            </div>
            <div class="feature">
                <h3>Advanced Analytics</h3>
                <p>Gain insights with powerful dashboards and detailed performance metrics.</p>
            </div>
            <div class="feature">
                <h3>Custom Workflows</h3>
                <p>Automate your processes with flexible workflows tailored to your needs.</p>
            </div>
        </div>
    </section>
    <section class="pricing">
        <h2 style="text-align: center;">Simple Pricing</h2>
        <div class="pricing-grid">
            <div class="price-card">
                <h3>Free</h3>
                <div class="price">$0</div>
                <p>Perfect for individuals</p>
            </div>
            <div class="price-card">
                <h3>Pro</h3>
                <div class="price">$29</div>
                <p>For growing teams</p>
            </div>
            <div class="price-card">
                <h3>Enterprise</h3>
                <div class="price">$99</div>
                <p>For large organizations</p>
            </div>
        </div>
    </section>
</body>
</html>
```

## IDEA Browser Setup

If using JetBrains IDEA's built-in browser:
1. Open IDEA
2. Go to View > Tool Windows > Web Browser
3. Or use the built-in preview for HTML files

## Quick Start Checklist

Before going live:
- [ ] Open Dora installed and tested
- [ ] Web UI running (if using)
- [ ] Demo project directory created
- [ ] Sample prompts ready
- [ ] OBS configured and tested
- [ ] Audio tested
- [ ] Backup HTML file ready
- [ ] Competitor demos prepared (recorded or live)
- [ ] Chat monitoring setup
- [ ] Stream title and description ready

## Stream Title and Description

**Title:** Testing $1 Million AI Website Builders: Can Open Dora Compete?

**Description:**
I'm testing Open Dora, an AI-powered development tool, against popular AI website builders like Wix, Squarespace, and Hostinger. Watch as I build a complete landing page for a fictional SaaS startup and see which tool delivers the best results!

🔧 What we're building: TaskFlow - a project management tool landing page
🆚 Competitors: Wix AI, Squarespace Blueprint, Hostinger, Shopify AI
📊 Criteria: Speed, code quality, customization, design, cost

Join the chat and let me know which AI builder you think will win!

#OpenDora #AI #WebDevelopment #WebsiteBuilder #Coding
