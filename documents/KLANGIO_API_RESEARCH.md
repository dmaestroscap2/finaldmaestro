# Klangio API Research

Research on Klangio's music transcription API for DMAESTRO integration.

---

## Overview

Klangio provides AI-powered music transcription via API. It can convert audio files into MIDI, MusicXML, PDF, or GP5 formats with high accuracy.

**Official Links:**
- Website: https://klang.io/
- API Info: https://klang.io/api/
- API Docs: https://api-docs.klang.io/
- GitHub: https://github.com/Klangio

---

## Features

### Core Capabilities

| Feature | Description |
|---------|-------------|
| **Music Transcription** | Convert audio → MIDI, MusicXML, PDF, GP5 |
| **Source Separation** | Isolate individual stems from mixed audio |
| **Beat Tracking** | Detect BPM, downbeats, meter, timing |
| **Chord Recognition** | Identify chord progressions and timing |
| **Strum Recognition** | Detect strumming directions (guitar) |

### Supported Instruments

| Instrument | Support | Notes |
|------------|---------|-------|
| Piano | ✅ Full | High accuracy |
| Guitar | ✅ Full | Acoustic, electric, tabs |
| Bass | ✅ Full | Electric bass |
| Vocals | ✅ Full | Melody extraction |
| Drums | ✅ Full | Kit pieces |
| Keys | ✅ Full | Keyboards, synths |
| Strings | ✅ | Via Transcription Studio |
| Wind | ✅ | Via Transcription Studio |

**Multi-instrument:** Detects up to 8 instruments simultaneously.

### Output Formats

| Format | Use Case |
|--------|----------|
| MIDI (quantized) | DAW import, practice apps |
| MIDI (unquantized) | Raw performance data |
| MusicXML | Notation software (MuseScore, Sibelius) |
| PDF | Sheet music printout |
| GP5 | Guitar Pro format |
| LilyPond | Open-source notation |

### Transcription Modes

| Mode | Best For |
|------|----------|
| **Classic** | String/wind ensembles + piano/guitar |
| **Rock** | Multiple guitars, bass, drums (handles distortion) |
| **Universal** | Any song/genre (most flexible) |

---

## API Pricing

| Plan | Monthly Cost | Requests/Month | Max Audio Length | Rate Limit |
|------|--------------|----------------|------------------|------------|
| **Free** | $0 | 50 | 15 seconds | 1 req/min |
| **Startup** | $99 | 500 | 5 minutes | 2 req/sec |
| **Business** | $499 | 3,000 | 5 minutes | 5 req/sec |
| **Enterprise** | Custom | 10,000+ | 10 minutes | 10 req/sec |

### Overage Pricing

| Plan | Cost per Extra Request |
|------|------------------------|
| Startup | $0.20 |
| Business | $0.17 |
| Enterprise | $0.10 |

### Free Tier Limitations

- Max 15 seconds audio (not enough for full songs)
- 50 requests/month
- 1 request per minute rate limit
- Good for testing only

---

## API Integration

### Authentication

API uses Bearer token authentication:

```
Authorization: Bearer YOUR_API_KEY
```

### Getting API Access

1. Go to https://klang.io/api/
2. Click "Apply Now"
3. Fill out application form (company, use case)
4. Receive API key via email

### Dashboard

Manage API keys and usage at: https://api-dashboard.klang.io/

### OpenAPI Specification

Full API spec available at: https://api.klang.io/open_api

---

## Expected API Usage (Example)

Based on typical REST API patterns:

### Transcription Request

```javascript
// POST /transcribe
const response = await fetch('https://api.klang.io/transcribe', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'multipart/form-data',
  },
  body: formData // Contains audio file
});

const result = await response.json();
// Returns: job ID or transcription result
```

### Parameters (Expected)

| Parameter | Type | Description |
|-----------|------|-------------|
| audio | File | MP3, WAV, FLAC, AAC |
| instrument | String | "piano", "guitar", "auto" |
| output_format | String | "midi", "musicxml", "pdf" |
| key | String | Major/minor key (optional) |
| time_signature | String | "4/4", "3/4" (optional) |
| tempo_range | String | BPM range hint (optional) |

### Response (Expected)

```json
{
  "status": "completed",
  "midi_url": "https://api.klang.io/files/abc123.mid",
  "notes": [
    {
      "pitch": "C4",
      "start": 0.5,
      "duration": 0.25,
      "velocity": 80
    }
  ],
  "tempo": 120,
  "time_signature": "4/4"
}
```

---

## Integration with DMAESTRO

### Option 1: Direct API Call

```typescript
// server/klangio.ts
import fetch from 'node-fetch';
import FormData from 'form-data';

const KLANGIO_API_KEY = process.env.KLANGIO_API_KEY;

export async function transcribeWithKlangio(audioBuffer: Buffer, filename: string) {
  const formData = new FormData();
  formData.append('audio', audioBuffer, filename);
  formData.append('output_format', 'midi');

  const response = await fetch('https://api.klang.io/transcribe', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${KLANGIO_API_KEY}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Klangio API error: ${response.status}`);
  }

  return await response.json();
}
```

### Option 2: Add to Upload Flow

```typescript
// In server/index.ts upload handler
app.post('/api/music/upload', async (req, res) => {
  const audioPath = req.file.path;
  const audioBuffer = fs.readFileSync(audioPath);

  // Call Klangio API
  const result = await transcribeWithKlangio(audioBuffer, req.file.filename);

  // Parse MIDI and save notes
  const notes = parseMidiToNotes(result.midi_url);

  // Save to database
  // ... rest of upload logic
});
```

---

## Comparison: Klangio vs Local Setup

| Aspect | Klangio API | Local (Demucs + ByteDance) |
|--------|-------------|---------------------------|
| **Cost** | $99/mo | Free |
| **Setup Time** | 30 min | 1-2 hours |
| **Processing Time** | ~30 sec | 3-5 min (CPU) |
| **Accuracy** | High (multi-instrument) | High (piano only) |
| **Instruments** | 8+ | Piano focused |
| **Internet Required** | Yes | No |
| **Reliability** | Depends on API | Fully controlled |

---

## Recommendations

### For Thesis Defense (1 week)

| Scenario | Recommendation |
|----------|----------------|
| Budget available | Pay $99 for Startup plan (500 requests) |
| No budget | Use local setup (free) |
| Want both | Local as primary, Klangio as backup |

### Getting Free/Discounted Access

1. **Email Klangio** explaining academic use case:
   ```
   Subject: Academic API Access Request - Thesis Defense

   Hi Klangio Team,

   I'm a student working on a music education platform (DMAESTRO)
   for my thesis defense. I would like to integrate your transcription
   API to demonstrate accurate multi-instrument note extraction.

   Would it be possible to get temporary academic access or a trial
   for my defense presentation?

   Thank you,
   [Your Name]
   ```

2. **Apply via website** and mention academic use in the form

3. **Check for student discounts** on their pricing page

---

## Consumer Apps (Alternative)

If API access is difficult, Klangio's consumer apps also work:

| App | Purpose | Free Tier |
|-----|---------|-----------|
| **Transcription Studio** | Multi-instrument | 20 sec limit |
| **Piano2Notes** | Piano only | 20 sec limit |
| **Guitar2Tabs** | Guitar/bass | 20 sec limit |
| **Sing2Notes** | Vocals | 20 sec limit |
| **Drum2Notes** | Drums | 20 sec limit |

**Workflow:** Use app manually → export MIDI → upload to DMAESTRO

---

## Files Reference

After integration, project structure:

```
dmaestro-real/
├── server/
│   ├── klangio.ts          # Klangio API client
│   └── index.ts            # Updated with Klangio route
├── documents/
│   ├── KLANGIO_API_RESEARCH.md
│   ├── LOCAL_SETUP_GUIDE.md
│   └── MUSIC_TRANSCRIPTION_RESEARCH.md
└── .env                    # KLANGIO_API_KEY
```

---

## Sources

- [Klangio Website](https://klang.io/)
- [Klangio API](https://klang.io/api/)
- [API Documentation](https://api-docs.klang.io/)
- [Klangio GitHub](https://github.com/Klangio)
- [Transcription Studio](https://klang.io/transcription-studio/)
- [Piano2Notes](https://klang.io/piano2notes/)
