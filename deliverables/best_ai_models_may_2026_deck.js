import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pptxgen = require('/tmp/opendora-pptxgen/node_modules/pptxgenjs');

const pptx = new pptxgen();
pptx.layout = 'LAYOUT_WIDE';
pptx.author = 'OpenDora / Office Clip';
pptx.company = 'OpenDora';
pptx.subject = 'Best AI models as of May 22, 2026';
pptx.title = 'Best AI Models: May 2026';
pptx.lang = 'en-US';
pptx.theme = {
  headFontFace: 'Aptos Display',
  bodyFontFace: 'Aptos',
  lang: 'en-US'
};
pptx.defineLayout({ name: 'WIDE', width: 13.333, height: 7.5 });
pptx.layout = 'WIDE';
pptx.margin = 0;
pptx.defineSlideMaster({
  title: 'MASTER',
  background: { color: '08111F' },
  objects: [
    { rect: { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: '08111F' }, line: { color: '08111F' } } },
    { rect: { x: 0, y: 6.95, w: 13.333, h: 0.55, fill: { color: '0D1B2E', transparency: 8 }, line: { color: '0D1B2E' } } },
    { text: { text: 'Best AI models snapshot | As of 22 May 2026', options: { x: 0.55, y: 7.08, w: 5.6, h: 0.2, fontFace: 'Aptos', fontSize: 6.8, color: '8BA4C4' } } }
  ],
  slideNumber: { x: 12.45, y: 7.08, color: '8BA4C4', fontFace: 'Aptos', fontSize: 6.8 }
});

const C = {
  bg: '08111F', panel: '102035', panel2: '132944', ink: 'F3F7FB', muted: 'A9BED6', line: '2C4565',
  amber: 'F6B44B', cyan: '43D6D6', green: '7EE787', red: 'FF7B72', blue: '7AA2FF', violet: 'B89EFF', white: 'FFFFFF'
};

function addBg(slide) {
  slide.background = { color: C.bg };
  slide.addShape(pptx.ShapeType.arc, { x: 9.1, y: -1.0, w: 5.0, h: 5.0, line: { color: C.cyan, transparency: 100 }, fill: { color: C.cyan, transparency: 88 }, adjustPoint: 0.2, rotate: 18 });
  slide.addShape(pptx.ShapeType.arc, { x: -1.1, y: 3.9, w: 4.4, h: 4.4, line: { color: C.amber, transparency: 100 }, fill: { color: C.amber, transparency: 90 }, rotate: 42 });
}
function title(slide, t, st) {
  slide.addText(t, { x: 0.55, y: 0.38, w: 8.6, h: 0.54, fontFace: 'Aptos Display', fontSize: 25, bold: true, color: C.ink, margin: 0 });
  if (st) slide.addText(st, { x: 0.57, y: 0.98, w: 9.0, h: 0.25, fontSize: 9.5, color: C.muted, margin: 0 });
}
function pill(slide, text, x, y, color=C.cyan, w=1.65) {
  slide.addShape(pptx.ShapeType.roundRect, { x, y, w, h: 0.3, rectRadius: 0.07, fill: { color, transparency: 6 }, line: { color, transparency: 100 } });
  slide.addText(text, { x: x+0.08, y: y+0.07, w: w-0.16, h: 0.12, fontSize: 6.6, bold: true, color: C.bg, align: 'center', margin: 0 });
}
function card(slide, x, y, w, h, heading, body, accent=C.cyan, small=false) {
  slide.addShape(pptx.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.08, fill: { color: C.panel, transparency: 0 }, line: { color: C.line, transparency: 20, width: 0.8 } });
  slide.addShape(pptx.ShapeType.rect, { x, y, w: 0.06, h, fill: { color: accent }, line: { color: accent } });
  slide.addText(heading, { x: x+0.22, y: y+0.18, w: w-0.38, h: 0.26, fontSize: small ? 10.5 : 13, bold: true, color: C.ink, margin: 0, breakLine: false });
  slide.addText(body, { x: x+0.22, y: y+0.55, w: w-0.38, h: h-0.68, fontSize: small ? 7.6 : 8.4, color: C.muted, margin: 0.02, fit: 'shrink', valign: 'top', breakLine: false });
}
function bullets(slide, items, x, y, w, h, fs=10, color=C.ink) {
  slide.addText(items.map(v => ({ text: v, options: { bullet: { type: 'ul' } } })), { x, y, w, h, fontSize: fs, color, fit: 'shrink', breakLine: false, margin: 0.03, paraSpaceAfterPt: 6, valign: 'top' });
}
function source(slide, s) { slide.addText('Sources: ' + s, { x: 6.35, y: 7.08, w: 5.75, h: 0.2, fontSize: 5.9, color: '6F87A6', margin: 0, align: 'right' }); }
function slideWithTitle(t, st) { const slide = pptx.addSlide('MASTER'); addBg(slide); title(slide, t, st); return slide; }

// 1
{
  const s = pptx.addSlide('MASTER'); addBg(s);
  s.addText('Best AI Models', { x: 0.65, y: 1.0, w: 7.0, h: 0.65, fontSize: 36, bold: true, color: C.ink, margin: 0 });
  s.addText('What to use in May 2026: coding, general reasoning, audio, and visual AI', { x: 0.7, y: 1.82, w: 7.6, h: 0.35, fontSize: 15, color: C.muted, margin: 0 });
  pill(s, 'closed + open-weight', 0.72, 2.45, C.cyan, 2.0); pill(s, 'best by task', 2.9, 2.45, C.amber, 1.55); pill(s, 'snapshot date: 22 May 2026', 4.65, 2.45, C.green, 2.35);
  s.addShape(pptx.ShapeType.roundRect, { x: 8.5, y: 1.05, w: 3.7, h: 4.75, rectRadius: 0.12, fill: { color: C.panel2, transparency: 0 }, line: { color: C.line } });
  ['General intelligence', 'Coding agents', 'Speech + music', 'Image + video'].forEach((v,i)=>{
    s.addShape(pptx.ShapeType.roundRect, { x: 8.95, y: 1.55+i*0.92, w: 2.8, h: 0.48, rectRadius: 0.05, fill: { color: [C.cyan,C.amber,C.green,C.blue][i], transparency: 10 }, line: { color: [C.cyan,C.amber,C.green,C.blue][i], transparency: 100 } });
    s.addText(v, { x: 9.15, y: 1.68+i*0.92, w: 2.4, h: 0.12, fontSize: 9.5, bold: true, color: C.bg, align: 'center', margin: 0 });
  });
  s.addNotes('Context: This is a market snapshot, not a single universal ranking. Some model names and benchmark rows change quickly in 2026. Treat this as a buyer/use-case routing guide.');
}

// 2
{
  const s = slideWithTitle('The May 2026 Landscape', 'No single winner: the best model depends on task, cost, deployment, and modality.');
  card(s, 0.65, 1.55, 3.85, 1.65, 'Closed frontier leads raw quality', 'Claude Opus 4.7 / Mythos, GPT-5.5, and Gemini 3.1 Pro split the top categories: coding depth, agentic terminal use, and multimodal reasoning.', C.cyan);
  card(s, 4.75, 1.55, 3.85, 1.65, 'Open-weight gap is shrinking', 'Kimi K2.6, DeepSeek V4, Qwen 3.6, GLM-5.x, Llama 4, and Mistral Large 3 are increasingly viable for self-hosting and cost control.', C.amber);
  card(s, 8.85, 1.55, 3.85, 1.65, 'Multimodal becomes default', 'Top systems now mix text, code, image, audio, and video. The distinction is less “chatbot” vs “tool” and more “router over modalities.”', C.green);
  s.addText('Decision rule', { x: 0.7, y: 3.85, w: 2.0, h: 0.25, fontSize: 14, color: C.ink, bold: true, margin: 0 });
  bullets(s, ['Use frontier closed models for hardest reasoning, coding, and reliability-sensitive work.', 'Use open-weight models when data control, self-hosting, latency, or unit economics matter.', 'Use specialized audio / image / video systems instead of one general model when media quality is the product.', 'Route across 2-4 models; avoid betting the whole stack on a single leaderboard winner.'], 0.9, 4.35, 11.5, 1.65, 10.5, C.ink);
  source(s, 'BenchLM, Artificial Analysis, FutureAGI, o-mega, model/provider announcements');
}

// 3
{
  const s = slideWithTitle('Best General & Multi-Domain Models', 'The strongest general models are now differentiated by workflow, not just raw benchmark averages.');
  card(s, 0.65, 1.5, 2.95, 3.95, 'Claude Opus 4.7 / Mythos', 'Best for complex reasoning, long-context analysis, and hard software engineering. Mythos leads several provisional rankings but may be limited-access.', C.cyan);
  card(s, 3.85, 1.5, 2.95, 3.95, 'GPT-5.5', 'Best for agentic terminal workflows, computer use, broad ecosystem access, and productized assistants. Strong default where OpenAI tooling matters.', C.amber);
  card(s, 7.05, 1.5, 2.95, 3.95, 'Gemini 3.1 Pro', 'Best value among US frontier models for multimodal, science/research, long context, and Google Cloud/RAG-heavy workflows.', C.green);
  card(s, 10.25, 1.5, 2.45, 3.95, 'Open-weight tier', 'Kimi K2.6, DeepSeek V4-Pro, Qwen 3.6, Llama 4, Mistral Large 3: pick by license, hosting budget, context, and language coverage.', C.blue, true);
  s.addText('Best practical stack: Claude for hard coding + Gemini for large multimodal context + GPT for terminal/product agents + one open-weight fallback.', { x: 0.75, y: 6.02, w: 11.6, h: 0.35, fontSize: 13, bold: true, color: C.ink, align: 'center', margin: 0 });
  source(s, 'BenchLM May 2026, FutureAGI May 2026, o-mega May 2026');
}

// 4
{
  const s = slideWithTitle('Best Coding Models', 'Coding is split between real-world repo repair, terminal agents, and self-hostable code models.');
  card(s, 0.65, 1.4, 3.15, 3.1, 'Best raw coding', 'Claude Mythos Preview / Claude Opus 4.7\nSWE-bench Verified and SWE-bench Pro leadership; strong multi-file issue repair and planning.', C.cyan);
  card(s, 4.0, 1.4, 3.15, 3.1, 'Best terminal agent', 'GPT-5.5 / Codex\nTop choice when the task is shell-heavy, repo navigation, debugging loops, and autonomous tool use.', C.amber);
  card(s, 7.35, 1.4, 2.55, 3.1, 'Best value frontier', 'Gemini 3.1 Pro\nStrong coding plus very large multimodal context at lower major-lab pricing.', C.green);
  card(s, 10.1, 1.4, 2.6, 3.1, 'Best open-weight', 'Kimi K2.6 / DeepSeek V4-Pro / GLM-5.x\nHigh coding scores with self-host or cheaper hosted routes.', C.blue, true);
  s.addText('Coding picks by need', { x: 0.72, y: 4.95, w: 2.6, h: 0.25, fontSize: 13, bold: true, color: C.ink, margin: 0 });
  bullets(s, ['Enterprise copilot: Claude Opus 4.7 or GPT-5.5 depending on IDE/tooling fit.', 'Autonomous dev agent: GPT-5.5 for terminal-heavy work; Claude for patch quality and review depth.', 'Cost-sensitive code automation: Kimi K2.6 or DeepSeek V4-Pro behind a routing layer.', 'Do not rely only on HumanEval-style scores; use SWE-bench Pro, SWE-Rebench, Terminal-Bench, and repo-specific evals.'], 0.9, 5.35, 11.3, 1.1, 8.8, C.ink);
  source(s, 'SWE-bench, BenchLM, LLM Stats, BuildFastWithAI, FutureAGI');
}

// 5
{
  const s = slideWithTitle('Open-Weight / “Free To Use” Shortlist', 'Free weights are not free operations: GPU, hosting, maintenance, and licenses still matter.');
  const rows = [
    ['Kimi K2.6', 'Open-weight coding/value leader; strong agentic behavior'],
    ['DeepSeek V4-Pro / Flash', 'Best cost-performance; Flash for very cheap throughput'],
    ['Qwen 3.6 / Qwen-VL', 'Strong multilingual, coding, and open vision family'],
    ['Llama 4 Scout / Maverick', 'Long-context open weights; good privacy/on-prem baseline'],
    ['Mistral Large 3 / Small 4', 'EU-friendly open-weight options, Apache-style deployment appeal'],
    ['Gemma 4', 'Smaller Apache-style models for commercial-safe local apps']
  ];
  rows.forEach((r,i)=>{
    const y = 1.45 + i*0.76;
    s.addShape(pptx.ShapeType.roundRect, { x: 0.85, y, w: 11.6, h: 0.5, rectRadius: 0.05, fill: { color: i%2?C.panel:C.panel2, transparency: 0 }, line: { color: C.line, transparency: 35 } });
    s.addText(r[0], { x: 1.1, y: y+0.14, w: 2.7, h: 0.12, fontSize: 9.5, bold: true, color: C.ink, margin: 0 });
    s.addText(r[1], { x: 4.0, y: y+0.14, w: 7.8, h: 0.12, fontSize: 8.7, color: C.muted, margin: 0 });
  });
  s.addText('Use open weights when you need data residency, predictable marginal cost, fine-tuning control, or offline/on-prem deployment.', { x: 1.0, y: 6.2, w: 11.2, h: 0.3, fontSize: 12, bold: true, color: C.green, align: 'center', margin: 0 });
  source(s, 'FutureAGI, BuildFastWithAI, provider/model cards');
}

// 6
{
  const s = slideWithTitle('Best Sound Models: Speech, TTS, Music', 'Audio is best treated as layers: STT, TTS, speech-to-speech, and music/song generation.');
  card(s, 0.65, 1.45, 2.8, 3.75, 'Speech-to-text', 'Deepgram Nova-3: production streaming default.\nAssemblyAI Universal-2: transcription plus intelligence.\nWhisper Large V3: open-source self-host baseline.\nGoogle Chirp: broad-language batch accuracy.', C.cyan, true);
  card(s, 3.65, 1.45, 2.8, 3.75, 'Text-to-speech', 'Inworld Realtime TTS 1.5 Max and Gemini 3.1 Flash TTS lead arena-style rankings.\nElevenLabs v3: expressive quality and cloning.\nFish Audio S2 Pro / Kokoro: open-weight picks.', C.amber, true);
  card(s, 6.65, 1.45, 2.8, 3.75, 'Native audio agents', 'GPT-Realtime-2 / GPT realtime family: speech-in, reasoning, speech-out without a separate STT/TTS chain.\nGemini Live and Grok/Step audio compete on speech reasoning.', C.green, true);
  card(s, 9.65, 1.45, 2.75, 3.75, 'Music + sound', 'Commercial: Suno, Udio, MiniMax/Mureka-style systems for polished songs.\nOpen: SongGeneration 2 / LeVo 2 and UniAudio 2 for music, sound, and audio tasks.', C.blue, true);
  s.addText('For voice products, choose latency first; for creator products, choose expressiveness and controllability first.', { x: 0.9, y: 5.95, w: 11.5, h: 0.32, fontSize: 12.5, bold: true, color: C.ink, align: 'center', margin: 0 });
  source(s, 'FutureAGI Voice AI, DeepLearning.AI, TTS Arena, SongGeneration 2, UniAudio 2');
}

// 7
{
  const s = slideWithTitle('Best Visual Generation Models', 'Image and video generation are specialized markets: use leaderboards, but test your own prompt style.');
  card(s, 0.65, 1.35, 3.65, 3.6, 'Image generation', 'Top commercial families to evaluate: GPT-image / DALL-E line, Midjourney v7, Imagen 4, Ideogram, FLUX, and Stable Diffusion derivatives.\nBest choice depends on realism, typography, editing, and brand consistency.', C.cyan);
  card(s, 4.85, 1.35, 3.65, 3.6, 'Video generation', 'Top commercial families to evaluate: Veo, Sora, Runway Gen-4, Kling, Luma Ray, Pika, and MiniMax video.\nKey criteria: motion coherence, character consistency, audio, editing controls, and rights.', C.amber);
  card(s, 9.05, 1.35, 3.2, 3.6, 'Open/local generation', 'FLUX / Stable Diffusion ecosystem for images; open video models are improving but still trail best closed systems for production polish.', C.green, true);
  bullets(s, ['Production rule: pick by output acceptance rate, not leaderboard rank alone.', 'Test with your real prompts: people, hands, text, product shots, diagrams, long camera moves, and brand constraints.', 'Track rights/licensing: training data, likeness, music/audio, and commercial usage terms vary widely.'], 0.9, 5.45, 11.2, 0.95, 8.8, C.ink);
  source(s, 'Artificial Analysis Image/Video arenas, provider releases, public model cards');
}

// 8
{
  const s = slideWithTitle('Best Visual Understanding Models', 'Vision is now a core capability for documents, UI agents, video analysis, and multimodal RAG.');
  card(s, 0.65, 1.45, 2.8, 3.65, 'Best fine visual reasoning', 'Claude Opus 4.7\nStrong document, chart, OCR-like, and fine-grained image analysis signals; good for review-heavy workflows.', C.cyan, true);
  card(s, 3.65, 1.45, 2.8, 3.65, 'Best broad multimodal', 'Gemini 3.1 Pro\nStrong image + audio + video input with large context; natural fit for long video/document analysis.', C.green, true);
  card(s, 6.65, 1.45, 2.8, 3.65, 'Best UI/computer use', 'GPT-5.5\nStrong ecosystem for computer-use, screen analysis, and agentic workflows where API/tooling integration matters.', C.amber, true);
  card(s, 9.65, 1.45, 2.75, 3.65, 'Best open vision', 'Qwen 3.6-VL / Llama 4 vision-capable variants\nGood self-host alternatives for OCR, VQA, screenshots, and private data.', C.blue, true);
  s.addText('Video understanding is a routing problem: combine keyframe extraction, transcript/audio, object/scene metadata, and a long-context multimodal model.', { x: 0.85, y: 5.85, w: 11.6, h: 0.34, fontSize: 11.8, bold: true, color: C.ink, align: 'center', margin: 0 });
  source(s, 'o-mega May 2026, FutureAGI May 2026, provider model cards');
}

// 9
{
  const s = slideWithTitle('Recommended Model Routing', 'A practical “best models” answer is a portfolio, not a single model.');
  const routes = [
    ['Hard coding + reviews', 'Claude Opus 4.7 / Mythos, with GPT-5.5 for terminal agents'],
    ['Everyday assistant / agents', 'GPT-5.5 or Claude Sonnet/Opus depending on tool ecosystem'],
    ['Research + multimodal docs', 'Gemini 3.1 Pro for long context and native audio/video/image input'],
    ['Low-cost automation', 'DeepSeek V4 Flash / Pro, Kimi K2.6, Qwen family'],
    ['Voice agents', 'Deepgram/Cartesia stack for latency; GPT-Realtime-2 when reasoning over speech matters'],
    ['Image/video production', 'Specialized media models; evaluate per brand style and usage rights']
  ];
  routes.forEach((r,i)=>{
    const y = 1.35 + i*0.72;
    s.addShape(pptx.ShapeType.roundRect, { x: 0.85, y, w: 11.55, h: 0.48, rectRadius: 0.05, fill: { color: i%2?C.panel:C.panel2 }, line: { color: C.line, transparency: 35 } });
    s.addText(r[0], { x: 1.05, y: y+0.14, w: 2.75, h: 0.11, fontSize: 8.8, bold: true, color: C.ink, margin: 0 });
    s.addText(r[1], { x: 3.95, y: y+0.14, w: 7.9, h: 0.11, fontSize: 8.3, color: C.muted, margin: 0 });
  });
  s.addShape(pptx.ShapeType.roundRect, { x: 1.0, y: 6.0, w: 11.15, h: 0.48, rectRadius: 0.08, fill: { color: C.green, transparency: 5 }, line: { color: C.green, transparency: 100 } });
  s.addText('Bottom line: keep a benchmark-informed shortlist, then run your own evals with real prompts, codebases, audio, images, and video.', { x: 1.2, y: 6.14, w: 10.75, h: 0.12, fontSize: 10.4, bold: true, color: C.bg, align: 'center', margin: 0 });
  source(s, 'Cross-source synthesis');
}

// 10
{
  const s = slideWithTitle('Source Notes & Caveats', 'Benchmarks move quickly; this deck is a dated market snapshot.');
  bullets(s, [
    'Primary benchmark references used: SWE-bench / BenchLM / LLM Stats for coding; Artificial Analysis and public arenas for model/media comparisons.',
    'News and synthesis references used: FutureAGI, BuildFastWithAI, o-mega, DeepLearning.AI, TTS Arena, and public GitHub/model-card pages.',
    'Some leading systems are proprietary, API-only, region-limited, waitlisted, or only available to selected partners.',
    '“Open source” is often actually “open weights”; verify license, commercial rights, acceptable-use policy, and deployment obligations.',
    'Best practice: build a small internal eval suite before procurement or model migration.'
  ], 0.95, 1.55, 11.5, 4.15, 11, C.ink);
  s.addText('Prepared for Mariusz | 22 May 2026', { x: 0.95, y: 6.15, w: 11.3, h: 0.28, fontSize: 13, bold: true, color: C.cyan, align: 'center', margin: 0 });
}

await pptx.writeFile({ fileName: '/home/mariu/projects/opendora/deliverables/best_ai_models_may_2026.pptx' });
