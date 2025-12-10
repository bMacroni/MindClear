import { useCallback, useEffect, useRef } from 'react';
import Sound from 'react-native-sound';

type UseSoundEffectOptions = {
  volume?: number;
  category?: 'Ambient' | 'Playback' | 'SoloAmbient' | 'MultiRoute';
};

/**
 * Preloads a short UI sound and exposes a play() function.
 * Uses Sound.MAIN_BUNDLE so Android raw resources can be referenced by filename.
 */
export const useSoundEffect = (fileName: string, options?: UseSoundEffectOptions) => {
  const soundRef = useRef<Sound | null>(null);
  const isLoadedRef = useRef(false);
  const volume = options?.volume ?? 1;
  const pendingPlayRef = useRef(false);
  const category = options?.category ?? 'Ambient';

  useEffect(() => {
    const candidateNames: string[] = [fileName];
    const baseName = fileName.replace(/\.[^/.]+$/, '');
    if (baseName !== fileName) {
      candidateNames.push(baseName);
    }
    const sanitizedBase = baseName.replace(/[^a-zA-Z0-9_]/g, '_');
    if (sanitizedBase && sanitizedBase !== baseName) {
      candidateNames.push(sanitizedBase, `${sanitizedBase}.wav`, `${sanitizedBase}.mp3`);
    }

    // Allow sounds to mix with other audio (UI cues should be non-disruptive)
    try {
      Sound.setCategory(category, true);
    } catch (error) {
      console.warn('[useSoundEffect] setCategory failed', error);
    }

    let cancelled = false;

    const tryLoad = (names: string[]) => {
      if (!names.length || cancelled) {
        return;
      }

      const name = names[0];
      const sound = new Sound(name, Sound.MAIN_BUNDLE, (error) => {
        if (cancelled) {
          sound.release();
          return;
        }

        if (error) {
          console.warn(`[useSoundEffect] Failed to load sound ${name}:`, error);
          sound.release();
          tryLoad(names.slice(1));
          return;
        }

        isLoadedRef.current = true;
        soundRef.current = sound;
        try {
          sound.setVolume(volume);
        } catch (err) {
          console.warn('[useSoundEffect] setVolume failed', err);
        }
        if (pendingPlayRef.current) {
          pendingPlayRef.current = false;
          sound.play((success) => {
            if (!success) {
              console.warn(`[useSoundEffect] Playback failed after load for ${fileName}`);
            }
          });
        }
      });
    };

    tryLoad(candidateNames);

    return () => {
      isLoadedRef.current = false;
      if (soundRef.current) {
        soundRef.current.release();
        soundRef.current = null;
      }
      cancelled = true;
    };
  }, [fileName, volume]);

  const play = useCallback(() => {
    const sound = soundRef.current;
    if (!sound || !isLoadedRef.current) {
      pendingPlayRef.current = true;
      return;
    }

    try {
      // Restart from beginning every time for crisp UI feedback
      sound.stop(() => {
        sound.setCurrentTime(0);
        sound.play((success) => {
          if (!success) {
            console.warn(`[useSoundEffect] Playback failed for ${fileName}`);
          }
        });
      });
    } catch (error) {
      console.warn('[useSoundEffect] play failed', error);
    }
  }, [fileName]);

  return { play, isLoaded: isLoadedRef.current };
};

