import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get('audio') as Blob | File | null;

    if (!audioFile || (audioFile instanceof Blob && audioFile.size === 0)) {
      return NextResponse.json(
        { error: 'No audio data received' },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey.includes('placeholder') || apiKey.includes('your_openai')) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured for audio transcription' },
        { status: 503 }
      );
    }

    // Determine filename with appropriate extension
    const mimeType = audioFile.type || 'audio/webm';
    let extension = 'webm';
    if (mimeType.includes('mp4') || mimeType.includes('m4a') || mimeType.includes('aac')) {
      extension = 'mp4';
    } else if (mimeType.includes('wav')) {
      extension = 'wav';
    } else if (mimeType.includes('ogg')) {
      extension = 'ogg';
    }

    const openaiFormData = new FormData();
    openaiFormData.append('file', audioFile, `audio.${extension}`);
    openaiFormData.append('model', 'whisper-1');
    openaiFormData.append('language', 'en');
    openaiFormData.append('prompt', 'Product manager workplace communication practice session response.');

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: openaiFormData,
    });

    if (!whisperRes.ok) {
      const errText = await whisperRes.text().catch(() => '');
      console.error('Whisper transcription error:', whisperRes.status, errText);
      return NextResponse.json(
        { error: `Transcription service error (${whisperRes.status})` },
        { status: whisperRes.status }
      );
    }

    const data = await whisperRes.json();
    return NextResponse.json({
      text: data.text ? data.text.trim() : '',
    });
  } catch (error: any) {
    console.error('Transcription route exception:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process audio recording' },
      { status: 500 }
    );
  }
}
