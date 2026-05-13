#!/usr/bin/env bash

set -euo pipefail

# Open Dora Live Stream Demo Setup Script
# This script helps set up the environment for the YouTube live stream

echo "🎬 Open Dora Live Stream Setup"
echo "=============================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the opendora directory
if [[ ! -f "package.json" ]]; then
    echo "❌ Error: Must run from opendora root directory"
    exit 1
fi

# Create demo directory
DEMO_DIR="$HOME/opendora-demo"
TASKFLOW_DIR="$DEMO_DIR/taskflow-landing"

echo -e "${GREEN}Creating demo directory structure...${NC}"
mkdir -p "$TASKFLOW_DIR"
echo "✓ Demo directory created: $TASKFLOW_DIR"

# Copy backup HTML file
BACKUP_HTML="$TASKFLOW_DIR/backup.html"
cat > "$BACKUP_HTML" << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TaskFlow - Streamline Your Workflow</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; }
        .hero { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 100px 20px; text-align: center; }
        .hero h1 { font-size: 3em; margin-bottom: 20px; }
        .hero p { font-size: 1.5em; margin-bottom: 30px; }
        .btn { background: white; color: #667eea; padding: 15px 30px; border: none; border-radius: 5px; font-size: 1.2em; cursor: pointer; transition: transform 0.2s; }
        .btn:hover { transform: scale(1.05); }
        .features { padding: 80px 20px; max-width: 1200px; margin: 0 auto; }
        .features h2 { text-align: center; margin-bottom: 40px; }
        .feature-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 30px; }
        .feature { padding: 30px; border-radius: 10px; background: #f5f5f5; transition: transform 0.2s; }
        .feature:hover { transform: translateY(-5px); }
        .feature h3 { color: #667eea; margin-bottom: 15px; }
        .pricing { padding: 80px 20px; background: #f9f9f9; }
        .pricing h2 { text-align: center; margin-bottom: 40px; }
        .pricing-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 30px; max-width: 1200px; margin: 0 auto; }
        .price-card { padding: 40px; background: white; border-radius: 10px; text-align: center; transition: transform 0.2s; }
        .price-card:hover { transform: translateY(-5px); box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
        .price { font-size: 3em; color: #667eea; margin: 20px 0; font-weight: bold; }
        .contact { padding: 80px 20px; max-width: 600px; margin: 0 auto; }
        .contact h2 { text-align: center; margin-bottom: 40px; }
        .form-group { margin-bottom: 20px; }
        .form-group label { display: block; margin-bottom: 5px; font-weight: bold; }
        .form-group input, .form-group textarea { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px; font-size: 1em; }
        .form-group textarea { height: 150px; resize: vertical; }
        footer { background: #333; color: white; padding: 40px 20px; text-align: center; }
    </style>
</head>
<body>
    <section class="hero">
        <h1>Streamline Your Workflow</h1>
        <p>The smartest way to manage projects and collaborate with your team</p>
        <button class="btn">Get Started Free</button>
    </section>
    
    <section class="features">
        <h2>Why TaskFlow?</h2>
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
        <h2>Simple Pricing</h2>
        <div class="pricing-grid">
            <div class="price-card">
                <h3>Free</h3>
                <div class="price">$0</div>
                <p>Perfect for individuals</p>
                <ul style="list-style: none; margin-top: 20px;">
                    <li>✓ Up to 3 projects</li>
                    <li>✓ Basic analytics</li>
                    <li>✓ Community support</li>
                </ul>
            </div>
            <div class="price-card">
                <h3>Pro</h3>
                <div class="price">$29<span style="font-size: 0.5em;">/mo</span></div>
                <p>For growing teams</p>
                <ul style="list-style: none; margin-top: 20px;">
                    <li>✓ Unlimited projects</li>
                    <li>✓ Advanced analytics</li>
                    <li>✓ Priority support</li>
                </ul>
            </div>
            <div class="price-card">
                <h3>Enterprise</h3>
                <div class="price">$99<span style="font-size: 0.5em;">/mo</span></div>
                <p>For large organizations</p>
                <ul style="list-style: none; margin-top: 20px;">
                    <li>✓ Custom integrations</li>
                    <li>✓ Dedicated support</li>
                    <li>✓ SLA guarantee</li>
                </ul>
            </div>
        </div>
    </section>
    
    <section class="contact">
        <h2>Get In Touch</h2>
        <form>
            <div class="form-group">
                <label for="name">Name</label>
                <input type="text" id="name" name="name" required>
            </div>
            <div class="form-group">
                <label for="email">Email</label>
                <input type="email" id="email" name="email" required>
            </div>
            <div class="form-group">
                <label for="message">Message</label>
                <textarea id="message" name="message" required></textarea>
            </div>
            <button type="submit" class="btn" style="width: 100%;">Send Message</button>
        </form>
    </section>
    
    <footer>
        <p>&copy; 2026 TaskFlow. All rights reserved.</p>
    </footer>
</body>
</html>
EOF
echo "✓ Backup HTML file created: $BACKUP_HTML"

# Create sample prompts file
PROMPTS_FILE="$TASKFLOW_DIR/prompts.txt"
cat > "$PROMPTS_FILE" << 'EOF'
# Open Dora Live Stream Prompts

## Prompt 1: Initial Build
Create a modern landing page for TaskFlow, a project management tool. Include:
- Hero section with headline "Streamline Your Workflow"
- Features section with 3 key features: Real-time collaboration, Advanced analytics, Custom workflows
- Pricing section with 3 tiers: Free ($0), Pro ($29/mo), Enterprise ($99/mo)
- Contact form with name, email, message fields
- Modern, clean design with blue accent colors
- Fully responsive for mobile devices

## Prompt 2: Iteration - Add Testimonials
Add a testimonials section with 3 customer reviews. Include customer name, company, and quote. Make it visually appealing with star ratings.

## Prompt 3: Iteration - Improve Design
Improve the visual design by:
- Adding subtle animations on scroll
- Using a gradient background for the hero section
- Adding hover effects on buttons
- Improving the spacing and typography

## Prompt 4: Add Interactive Elements
Add:
- A mobile navigation menu that toggles on small screens
- Smooth scrolling for anchor links
- A back-to-top button
- Form validation for the contact form

## Prompt 5: Final Polish
Finalize the design with:
- Better color scheme consistency
- Improved accessibility (ARIA labels, alt text)
- Performance optimization (minified CSS, optimized images)
- SEO meta tags
EOF
echo "✓ Sample prompts file created: $PROMPTS_FILE"

# Create comparison notes file
COMPARISON_FILE="$TASKFLOW_DIR/comparison-notes.md"
cat > "$COMPARISON_FILE" << 'EOF'
# Open Dora vs Competitors - Live Stream Notes

## Open Dora
**Pros:**
- Full code control and ownership
- No vendor lock-in
- Can build any type of application
- Integrates with existing development workflow
- Terminal-based for developers
- API for programmatic access
- Free and open source

**Cons:**
- Steeper learning curve
- Requires technical knowledge
- No visual builder interface
- Need to handle deployment yourself

**Best For:** Developers who want full control and custom applications

## Wix AI Website Builder
**Pros:**
- Very easy to use, drag-and-drop
- Hosting included
- 20+ AI tools
- Great for non-technical users
- Professional templates

**Cons:**
- Vendor lock-in
- Limited code access
- Can't build complex applications
- Monthly cost ($15.30+/mo)
- Limited customization

**Best For:** Non-technical users needing simple websites quickly

## Squarespace Blueprint AI
**Pros:**
- Beautiful designs
- 5-step AI collaboration process
- High-quality templates
- Good for creative professionals
- Hosting included

**Cons:**
- Expensive ($14.40+/mo)
- Limited flexibility
- Vendor lock-in
- Steep learning curve for advanced features

**Best For:** Design-focused websites, portfolios, creative businesses

## Hostinger Website Builder
**Pros:**
- Very affordable ($2.99/mo)
- Fast setup
- AI SEO tools
- Good for small businesses
- Hosting included

**Cons:**
- Limited AI features
- Basic templates
- Less polished than competitors
- Limited customization

**Best For:** Budget-conscious small businesses

## Shopify AI
**Pros:**
- Best for e-commerce
- Excellent AI store setup
- Powerful inventory management
- Great payment processing
- Large app ecosystem

**Cons:**
- Expensive ($29+/mo)
- Overkill for simple sites
- Transaction fees
- Limited to e-commerce

**Best For:** Online stores and e-commerce businesses

## 10Web AI Builder
**Pros:**
- WordPress-based
- Good for existing WordPress users
- AI generates from URL
- Flexible customization
- Large plugin ecosystem

**Cons:**
- Requires WordPress knowledge
- Performance can be slow
- Security concerns with WordPress
- Plugin conflicts

**Best For:** WordPress users needing AI assistance

## Summary Table

| Tool | Setup Time | Code Quality | Customization | Cost | Learning Curve |
|------|-----------|--------------|---------------|------|----------------|
| Open Dora | Medium | High | Very High | Free | High |
| Wix AI | Low | Medium | Low | $15+/mo | Low |
| Squarespace | Medium | Medium | Medium | $14+/mo | Medium |
| Hostinger | Low | Low | Low | $3/mo | Low |
| Shopify | Low | Medium | Medium | $29+/mo | Medium |
| 10Web | Medium | Medium | High | Varies | Medium |

## Live Stream Verdict

**Winner for Developers:** Open Dora
- Full control over code
- No ongoing costs
- Can build anything
- Integrates with existing workflow

**Winner for Non-Technical Users:** Wix AI
- Easiest to use
- Beautiful results
- All-in-one solution
- Great support

**Winner for E-commerce:** Shopify AI
- Purpose-built for stores
- Powerful features
- Excellent payment processing

**Winner for Budget:** Hostinger
- Cheapest option
- Decent features
- Good value for money
EOF
echo "✓ Comparison notes created: $COMPARISON_FILE"

echo ""
echo -e "${GREEN}✅ Demo setup complete!${NC}"
echo ""
echo "Demo directory: $TASKFLOW_DIR"
echo ""
echo "Next steps:"
echo "1. cd $TASKFLOW_DIR"
echo "2. Review the files created"
echo "3. Start Open Dora: cd /home/mariu/projects/opendora && bun run dev"
echo "4. Open backup.html in browser as fallback"
echo "5. Use prompts.txt for live stream prompts"
echo ""
echo -e "${YELLOW}Good luck with your live stream! 🎬${NC}"
