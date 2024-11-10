const LOCAL_RELAY_SERVER_URL: string =
  process.env.REACT_APP_LOCAL_RELAY_SERVER_URL || '';

import { useEffect, useRef, useCallback, useState } from 'react';

import { RealtimeClient } from '@openai/realtime-api-beta';
import { ItemType } from '@openai/realtime-api-beta/dist/lib/client.js';
import { WavRecorder, WavStreamPlayer } from '../lib/wavtools/index.js';

import { X, Zap, Settings } from 'react-feather';
import { Button } from '../components/button/Button';
import { Toggle } from '../components/toggle/Toggle';

import './ConsolePage.scss';

export function ConsolePage() {

  const apiKey = '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';

  const [showSettings, setShowSettings] = useState(false);
  const [accent, setAccent] = useState("American");

  // Generate instructions dynamically based on accent and tone
  const generateInstructions = () => `
    System settings:
    Tool use: enabled.

    Instructions:
    - You are the world's best speech coach.
    - Help the user pronounce words according to the ${accent} accent.
    - Use a neutral tone.

    Personality:
    - Be clear and supportive.
  `;

  const toggleSettingsModal = () => {
    setShowSettings(!showSettings);
    if (!showSettings) {
      // Update session instructions with the latest settings
      const updatedInstructions = generateInstructions();
      clientRef.current.updateSession({ instructions: updatedInstructions });
    }
  };

  const wavRecorderRef = useRef<WavRecorder>(
    new WavRecorder({ sampleRate: 24000 })
  );
  const wavStreamPlayerRef = useRef<WavStreamPlayer>(
    new WavStreamPlayer({ sampleRate: 24000 })
  );
  const clientRef = useRef<RealtimeClient>(
    new RealtimeClient(
      LOCAL_RELAY_SERVER_URL
        ? { url: LOCAL_RELAY_SERVER_URL }
        : {
          apiKey: apiKey,
          dangerouslyAllowAPIKeyInBrowser: true,
        }
    )
  );

  /**
   * All of our variables for displaying application state
   * - realtimeEvents are event logs, which can be expanded
   */
  const [items, setItems] = useState<ItemType[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [canPushToTalk, setCanPushToTalk] = useState(true);
  const [isRecording, setIsRecording] = useState(false);

  /**
   * Connect to conversation:
   * WavRecorder taks speech input, WavStreamPlayer output, client is API client
   */
  const connectConversation = useCallback(async () => {
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    const wavStreamPlayer = wavStreamPlayerRef.current;

    // Set state variables
    setIsConnected(true);
    setItems(client.conversation.getItems());

    // Connect to microphone
    await wavRecorder.begin();

    // Connect to audio output
    await wavStreamPlayer.connect();

    // Connect to realtime API
    await client.connect();
    client.sendUserMessageContent([
      {
        type: 'input_text',
        text: 'Hello!',
      },
    ]);

    if (client.getTurnDetectionType() === 'server_vad') {
      await wavRecorder.record((data) => client.appendInputAudio(data.mono));
    }
  }, []);

  /**
   * Disconnect and reset conversation state
   */
  const disconnectConversation = useCallback(async () => {
    setIsConnected(false);
    setItems([]);

    const client = clientRef.current;
    client.disconnect();

    const wavRecorder = wavRecorderRef.current;
    await wavRecorder.end();

    const wavStreamPlayer = wavStreamPlayerRef.current;
    await wavStreamPlayer.interrupt();
  }, []);
  /**
   * In push-to-talk mode, start recording
   * .appendInputAudio() for each sample
   */
  const startRecording = async () => {
    setIsRecording(true);
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    const wavStreamPlayer = wavStreamPlayerRef.current;
    const trackSampleOffset = await wavStreamPlayer.interrupt();
    if (trackSampleOffset?.trackId) {
      const { trackId, offset } = trackSampleOffset;
      await client.cancelResponse(trackId, offset);
    }
    await wavRecorder.record((data) => client.appendInputAudio(data.mono));
  };

  /**
   * In push-to-talk mode, stop recording
   */
  const stopRecording = async () => {
    setIsRecording(false);
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    await wavRecorder.pause();
    client.createResponse();
  };

  /**
   * Switch between Manual <> VAD mode for communication
   */
  const changeTurnEndType = async (value: string) => {
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    if (value === 'none' && wavRecorder.getStatus() === 'recording') {
      await wavRecorder.pause();
    }
    client.updateSession({
      turn_detection: value === 'none' ? null : { type: 'server_vad' },
    });
    if (value === 'server_vad' && client.isConnected()) {
      await wavRecorder.record((data) => client.appendInputAudio(data.mono));
    }
    setCanPushToTalk(value === 'none');
  };

  /**
   * Auto-scroll the conversation logs
   */
  useEffect(() => {
    const conversationEls = [].slice.call(
      document.body.querySelectorAll('[data-conversation-content]')
    );
    for (const el of conversationEls) {
      const conversationEl = el as HTMLDivElement;
      conversationEl.scrollTop = conversationEl.scrollHeight;
    }
  }, [items]);

  /**
   * Core RealtimeClient and audio capture setup
   * Set all of our instructions, tools, events and more
   */
  useEffect(() => {
    // Get refs
    const wavStreamPlayer = wavStreamPlayerRef.current;
    const client = clientRef.current;

    // Set instructions
    client.updateSession({ instructions: generateInstructions() });
    // Set transcription, otherwise we don't get user transcriptions back
    client.updateSession({ input_audio_transcription: { model: 'whisper-1' } });

    client.on('error', (event: any) => console.error(event));
    client.on('conversation.interrupted', async () => {
      const trackSampleOffset = await wavStreamPlayer.interrupt();
      if (trackSampleOffset?.trackId) {
        const { trackId, offset } = trackSampleOffset;
        await client.cancelResponse(trackId, offset);
      }
    });
    client.on('conversation.updated', async ({ item, delta }: any) => {
      const items = client.conversation.getItems();
      if (delta?.audio) {
        wavStreamPlayer.add16BitPCM(delta.audio, item.id);
      }
      if (item.status === 'completed' && item.formatted.audio?.length) {
        const wavFile = await WavRecorder.decode(
          item.formatted.audio,
          24000,
          24000
        );
        item.formatted.file = wavFile;
      }
      setItems(items);
    });

    setItems(client.conversation.getItems());

    return () => {
      // cleanup; resets to defaults
      client.reset();
    };
  }, []);

  /**
   * Render the application
   */
  return (
    <div data-component="ConsolePage" className="console-page">
      <div className="content-top">
        <div className="content-title">
          <img src="/WaterFlow.svg" />
          <span>WaterFlow</span>
        </div>
        <div className="top-right-text">private, personal pronunciation</div>
      </div>
      <div className="content-main">
        <div className="content-logs">
          <div className="content-block conversation">
            <div className="content-block-title">conversation</div>
            <div className="content-block-body" data-conversation-content>
              {!items.length && `waiting on you...`}
              {items.map((conversationItem, i) => {
                return (
                  <div className="conversation-item" key={conversationItem.id}>
                    <div className={`speaker ${conversationItem.role || ''}`}>
                      <div>
                        {(
                          conversationItem.role || conversationItem.type
                        ).replaceAll('_', ' ')}
                      </div>
                    </div>
                    <div className={`speaker-content`}>
                      {!conversationItem.formatted.tool &&
                        conversationItem.role === 'user' && (
                          <div>
                            {conversationItem.formatted.transcript ||
                              (conversationItem.formatted.audio?.length
                                ? '(awaiting transcript)'
                                : conversationItem.formatted.text ||
                                '(item sent)')}
                          </div>
                        )}
                      {!conversationItem.formatted.tool &&
                        conversationItem.role === 'assistant' && (
                          <div>
                            {conversationItem.formatted.transcript ||
                              conversationItem.formatted.text ||
                              '(truncated)'}
                          </div>
                        )}
                      {conversationItem.formatted.file && (
                        <audio
                          src={conversationItem.formatted.file.url}
                          controls
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <button className="settings-button" onClick={toggleSettingsModal}>
          <Settings />
        </button>
      </div>
      <div className="content-actions">
        <Toggle
          defaultValue={false}
          labels={['Wait to Speak', 'Speak Continuously']}
          values={['none', 'server_vad']}
          onChange={(_, value) => changeTurnEndType(value)}
        />
        <div className="content-actions" />
        {isConnected && canPushToTalk && (
          <Button
            label={isRecording ? 'release to send' : 'Hold to Speak'}
            buttonStyle={isRecording ? 'alert' : 'regular'}
            disabled={!isConnected || !canPushToTalk}
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
          />
        )}
        <div className="content-actions" />
        <Button
          label={isConnected ? 'Stop' : 'Speak'}
          iconPosition={isConnected ? 'end' : 'start'}
          icon={isConnected ? X : Zap}
          buttonStyle={isConnected ? 'regular' : 'action'}
          onClick={
            isConnected ? disconnectConversation : connectConversation
          }
        />
      </div>
      {showSettings && (
        <div className="settings-modal">
          <div className="settings-modal-content">
            <h2>Settings</h2>
            <div className="setting-option">
              <label>Accent:</label>
              <select value={accent} onChange={(e) => setAccent(e.target.value)}>
                <option value="American">American</option>
                <option value="British">British</option>
                <option value="Australian">Australian</option>
              </select>
            </div>
            <button className="close-button" onClick={toggleSettingsModal}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
