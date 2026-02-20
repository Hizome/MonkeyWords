import { useState, useEffect, useRef, useMemo } from 'react';
import * as wanakana from 'wanakana';
import { fetchWords, submitResult, type Word } from './api';



const LANGUAGES = [
  { code: 'jp', label: 'Japanese', flag: '🇯🇵' },
  { code: 'de', label: 'German', flag: '🇩🇪' },
  { code: 'fr', label: 'French', flag: '🇫🇷' },
  { code: 'ru', label: 'Russian', flag: '🇷🇺' },
  { code: 'es', label: 'Spanish', flag: '🇪🇸' },
] as const;

const THEMES = [
  { id: 'tokyo-night', label: 'Tokyo Night', icon: '🌙' },
  { id: 'monkey', label: 'Monkey', icon: '🍌' },
] as const;

const WORDS_PER_PAGE = 14;

const App = () => {
  const [language, setLanguage] = useState<string>('jp');
  const [level, setLevel] = useState<number>(1);
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
  const [isLevelMenuOpen, setIsLevelMenuOpen] = useState(false);
  const [theme, setTheme] = useState('tokyo-night');
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);

  // Apply theme on change
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Handle global clicks to close menus
  useEffect(() => {
    const handleClickOutside = () => {
      setIsLangMenuOpen(false);
      setIsLevelMenuOpen(false);
      setIsThemeMenuOpen(false);
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  const [words, setWords] = useState<Word[]>([]);
  const [rawInput, setRawInput] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const [stats, setStats] = useState({ wpm: 0, accuracy: 0 });
  const [keystrokes, setKeystrokes] = useState({ total: 0, correct: 0 });
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [pastCharsCount, setPastCharsCount] = useState(0);
  const [wordPool, setWordPool] = useState<Word[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadWords(language, level);
  }, [language, level]);

  const generatePageWords = (pool: Word[], count: number = 27): Word[] => {
    if (pool.length === 0) return [];
    const pageWords: Word[] = [];
    for (let i = 0; i < count; i++) {
      const randomWord = pool[Math.floor(Math.random() * pool.length)];
      // Clone to ensure unique React keys if we used object ref, but here we use ID. 
      // Actually, if we use same 'id', React keys will duplicate. We need unique keys for the list.
      // Let's rely on index in map for key or generate a temporary ID.
      // For now, let's just clone and append a unique signature if needed, or better:
      // modifying the ID might be confusing for stats but necessary for React list.
      // Let's composite ID: `${word.id}-${i}`
      pageWords.push({ ...randomWord, id: parseInt(`${randomWord.id}${i}`) }); // Hacky ID generation for uniqueness
    }
    return pageWords;
  };

  const loadWords = async (lang: string, lvl: number = 1) => {
    try {
      const data = await fetchWords(lang, lvl); // Fetches 10 words
      setWordPool(data);
      const pageWords = generatePageWords(data, WORDS_PER_PAGE);
      setWords(pageWords);

      setCurrentIndex(0);
      setRawInput('');
      setStartTime(null);
      setFinished(false);
      setKeystrokes({ total: 0, correct: 0 });
      setInputHistory([]);
      setPastCharsCount(0);
    } catch (error) {
      console.error('Failed to load words:', error);
    }
  };

  const nextPage = async () => {
    // 1. Accumulate characters from the completed page
    const pageChars = words.reduce((acc, w) => acc + w.pron.length, 0);
    setPastCharsCount(prev => prev + pageChars);

    // 2. Generate new page from EXISTING pool
    // Optimistic UI: clear inputs immediately
    setInputHistory([]);
    setCurrentIndex(0);
    setRawInput('');

    const pageWords = generatePageWords(wordPool, WORDS_PER_PAGE);
    setWords(pageWords);
  };

  // Convert raw romaji to pron and split into confirmed pron vs pending romaji (JP only)
  const { confirmedKana, pendingRomaji } = useMemo(() => {
    if (language !== 'jp') return { confirmedKana: rawInput, pendingRomaji: '' };

    const converted = wanakana.toKana(rawInput, { IMEMode: true });

    // Find the boundary: confirmed pron chars at the start, pending romaji at the end
    let pronEnd = 0;
    for (let i = 0; i < converted.length; i++) {
      if (wanakana.isKana(converted[i])) {
        pronEnd = i + 1;
      } else {
        break;
      }
    }

    return {
      confirmedKana: converted.slice(0, pronEnd),
      pendingRomaji: converted.slice(pronEnd),
    };
  }, [rawInput, language]);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (finished) return;
    const val = e.target.value;
    setRawInput(val);

    if (!startTime && val.length > 0) {
      setStartTime(Date.now());
    }

    const currentWord = words[currentIndex];
    if (!currentWord) return;

    let targetInput = val;

    if (language === 'jp') {
      const converted = wanakana.toKana(val, { IMEMode: true });
      let pronEnd = 0;
      for (let i = 0; i < converted.length; i++) {
        if (wanakana.isKana(converted[i])) {
          pronEnd = i + 1;
        } else {
          break;
        }
      }
      targetInput = converted.slice(0, pronEnd);
    }

    // Track keystroke accuracy
    // For simplicity in DE/FR, we count matching prefix length as correct keystrokes
    // Ideally we'd track actual key presses but this is a close approximation
    let isCorrect = false;
    if (language === 'jp') {
      isCorrect = targetInput === currentWord.pron.slice(0, targetInput.length);
    } else {
      isCorrect = currentWord.pron.startsWith(val);
    }

    setKeystrokes(prev => ({
      total: prev.total + 1,
      correct: isCorrect ? prev.correct + 1 : prev.correct,
    }));

    // Auto-advance
    if (language === 'jp') {
      if (targetInput === currentWord.pron) {
        advanceWord(targetInput);
      }
    } else {
      if (val === currentWord.pron) {
        advanceWord(val);
      }
    }
  };

  const advanceWord = (typedInput: string) => {
    setInputHistory(prev => [...prev, typedInput]);
    if (currentIndex === words.length - 1) {
      // Instead of finishing, load next page
      nextPage();
    } else {
      setCurrentIndex(prev => prev + 1);
      setRawInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (rawInput.length === 0 && currentIndex > 0) {
        e.preventDefault();
        const prevIndex = currentIndex - 1;
        const prevInput = inputHistory[prevIndex] || '';

        // Restore state to previous word
        setInputHistory(prev => prev.slice(0, -1));
        setCurrentIndex(prevIndex);
        setRawInput(prevInput);
      }
    }
    if (e.key === 'Escape') {
      loadWords(language, level);
    }
    if (e.key === 'Enter') {
      // Allow manual finish if user wants to see stats
      if (!finished && startTime) {
        finishGame();
      }
    }
    if (e.key === ' ') {
      e.preventDefault();
      // Only allow skipping if some input has happened or user wants to skip
      // Currently implemented as skip word
      if (!finished && words.length > 0) {
        if (currentIndex < words.length - 1) {
          const effectiveInput = language === 'jp' ? confirmedKana : rawInput;
          const currentWord = words[currentIndex];

          // Count untyped/missing characters as errors
          const missingLen = Math.max(0, currentWord.pron.length - effectiveInput.length);
          if (missingLen > 0) {
            setKeystrokes(prev => ({
              total: prev.total + missingLen,
              correct: prev.correct
            }));
          }

          advanceWord(effectiveInput);
        }
      }
    }
  };

  const finishGame = async () => {
    if (!startTime) return;
    const durationMinutes = (Date.now() - startTime) / 60000;

    // Calculate total chars across all pages + current page so far
    const currentPageChars = words.slice(0, currentIndex).reduce((acc, w) => acc + w.pron.length, 0);
    // Add current word partial progress? Not strictly necessary for "finished" stats usually, but accuracy tracks keystrokes.
    // For WPM, we usually count completed words.

    const totalChars = pastCharsCount + currentPageChars + words[currentIndex].pron.length; // Approximate including last word

    const wpm = Math.round((totalChars / 5) / durationMinutes);
    const accuracy = Math.round((keystrokes.correct / (keystrokes.total || 1)) * 100);

    setStats({ wpm, accuracy });
    setFinished(true);

    try {
      await submitResult({ wpm, accuracy, timestamp: Date.now() });
    } catch (error) {
      console.error('Failed to submit result:', error);
    }
  };

  return (
    <div className="min-h-screen bg-background text-text p-8 font-sans transition-colors duration-300 flex flex-col items-center justify-center select-none" onKeyDown={() => {
      if (finished) return;
      inputRef.current?.focus();
    }} onClick={() => {
      inputRef.current?.focus();
      setIsLangMenuOpen(false);
    }}>
      {/* GitHub Link - Top Left */}
      <a
        href="https://github.com/Hizome/MonkeyWords"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed top-8 left-8 z-50 p-2 bg-sub/10 hover:bg-sub/20 rounded-lg transition-all text-sub hover:text-text border border-sub/5 shadow-sm group"
        title="View on GitHub"
      >
        <svg
          height="20"
          width="20"
          viewBox="0 0 16 16"
          fill="currentColor"
          className="transition-transform group-hover:scale-110"
        >
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
        </svg>
      </a>

      {/* Theme Switcher - Top Right */}
      <div className="fixed top-8 right-8 z-50">
        <div className="relative text-left">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsThemeMenuOpen(!isThemeMenuOpen);
              setIsLangMenuOpen(false);
              setIsLevelMenuOpen(false);
            }}
            className="flex items-center gap-2 px-3 py-2 bg-sub/10 hover:bg-sub/20 rounded-lg transition-all text-sub hover:text-text font-mono text-sm border border-sub/5 shadow-sm"
          >
            <span>{THEMES.find(t => t.id === theme)?.icon}</span>
            <span className={`text-[10px] transition-transform duration-200 ${isThemeMenuOpen ? 'rotate-180' : ''}`}>▼</span>
          </button>

          {isThemeMenuOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-[#1a1b26] border border-sub/20 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 origin-top-right py-1">
              <div className="px-4 py-2 text-[10px] uppercase tracking-wider text-sub font-bold opacity-50">Theme</div>
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setTheme(t.id);
                    setIsThemeMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-mono hover:bg-sub/10 transition-colors text-left
                                ${theme === t.id ? 'text-main bg-sub/5 font-bold' : 'text-sub'}`}
                >
                  <span>{t.icon}</span>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <header className="mb-16 text-center relative z-10">
        <h1 className="text-4xl font-bold text-main mb-2">MonkeyWords</h1>
        <p className="text-sub mb-4">Vocabulary Typing</p>

        <div className="flex flex-row items-center justify-center gap-4">
          {/* Language Selector */}
          <div className="relative inline-block text-left">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsLangMenuOpen(!isLangMenuOpen);
                setIsLevelMenuOpen(false);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-sub/10 hover:bg-sub/20 rounded-lg transition-colors text-text font-mono text-sm border border-sub/5"
            >
              <span className="opacity-70">Lang:</span>
              <span className="flex items-center gap-2">
                <span>{LANGUAGES.find(l => l.code === language)?.flag}</span>
                <span>{LANGUAGES.find(l => l.code === language)?.label}</span>
              </span>
              <span className={`text-[10px] transition-transform duration-200 opacity-50 ${isLangMenuOpen ? 'rotate-180' : ''}`}>▼</span>
            </button>

            {isLangMenuOpen && (
              <div className="absolute left-0 mt-2 w-48 bg-[#1a1b26] border border-sub/20 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 origin-top-left py-1">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={(e) => {
                      e.stopPropagation();
                      setLanguage(lang.code);
                      setIsLangMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-mono hover:bg-sub/10 transition-colors text-left
                                  ${language === lang.code ? 'text-main bg-sub/5' : 'text-sub'}`}
                  >
                    <span className="text-lg">{lang.flag}</span>
                    <span>{lang.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Level Selector */}
          <div className="relative inline-block text-left">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsLevelMenuOpen(!isLevelMenuOpen);
                setIsLangMenuOpen(false);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-sub/10 hover:bg-sub/20 rounded-lg transition-colors text-text font-mono text-sm border border-sub/5"
            >
              <span className="opacity-70">Level:</span>
              <span>{level}</span>
              <span className={`text-[10px] transition-transform duration-200 opacity-50 ${isLevelMenuOpen ? 'rotate-180' : ''}`}>▼</span>
            </button>

            {isLevelMenuOpen && (
              <div className="absolute left-0 mt-2 w-32 bg-[#1a1b26] border border-sub/20 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 origin-top-left py-1">
                {[1, 2].map((l) => (
                  <button
                    key={l}
                    onClick={(e) => {
                      e.stopPropagation();
                      setLevel(l);
                      setIsLevelMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-mono hover:bg-sub/10 transition-colors text-left
                                  ${level === l ? 'text-main bg-sub/5 font-bold' : 'text-sub'}`}
                  >
                    <span>Level {l}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="w-full max-w-4xl relative">
        <div className="flex justify-between items-center mb-8 text-sub font-mono">
          <div className="flex gap-4 items-center">
            {/* WPM hidden from HUD */}
            <div className="flex items-center gap-3 text-sm">
              <span className="opacity-70">Acc</span>
              <div className="w-32 h-1.5 bg-sub/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-main transition-all duration-300 ease-out rounded-full"
                  style={{ width: `${keystrokes.total > 0 ? Math.round((keystrokes.correct / keystrokes.total) * 100) : 100}%` }}
                />
              </div>
              <span className="w-10 text-right opacity-70 font-mono">
                {keystrokes.total > 0 ? Math.round((keystrokes.correct / keystrokes.total) * 100) : 100}%
              </span>
            </div>
          </div>
          <button onClick={() => loadWords(language, level)} className="hover:text-text transition-colors">Restart (Esc)</button>
        </div>

        {finished ? (
          <div className="text-center">
            <h2 className="text-6xl font-bold text-main mb-4">Results</h2>
            <div className="flex justify-center gap-16 text-sub">
              <div>
                <p className="text-xl">WPM</p>
                <p className="text-5xl text-main font-mono">{stats.wpm}</p>
              </div>
              <div>
                <p className="text-xl">Accuracy</p>
                <p className="text-5xl text-main font-mono">{stats.accuracy}%</p>
              </div>
            </div>
            <button
              onClick={() => loadWords(language, level)}
              className="mt-12 px-8 py-3 bg-sub/20 hover:bg-sub/30 text-text rounded-lg transition-all"
            >
              Try Again
            </button>
          </div>
        ) : (
          <div className="relative leading-relaxed">
            <input
              ref={inputRef}
              type="text"
              autoFocus
              className="absolute opacity-0 pointer-events-none"
              value={rawInput}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
            />

            <div className="flex flex-wrap content-start justify-center h-80 overflow-hidden">
              {words.map((word, wIdx) => {
                const isCurrent = wIdx === currentIndex;
                const isPast = wIdx < currentIndex;

                return (
                  <div key={word.id} className={`word group m-2 flex flex-col items-center max-w-full`}>
                    {/* Top Text: Kanji for JP, English Meaning for DE/FR */}
                    <span className="text-sub text-sm mb-1 font-mono">{word.word}</span>
                    <div className="relative flex flex-wrap justify-center break-all">
                      {(() => {
                        const wordLen = word.pron.length;

                        // Define what the current user input "actually is" for this word
                        const typedString = isCurrent
                          ? (language === 'jp' ? confirmedKana + pendingRomaji : rawInput)
                          : (isPast ? (inputHistory[wIdx] || '') : '');

                        const inputLen = typedString.length;
                        const maxLen = Math.max(wordLen, inputLen);
                        const charsToRender = [];

                        for (let i = 0; i < maxLen; i++) {
                          const targetChar = word.pron[i];
                          const typedChar = typedString[i];
                          let displayChar = targetChar;
                          let status = '';
                          let isExtra = i >= wordLen;

                          if (typedChar !== undefined) {
                            if (isExtra) {
                              // Overflow: show typed char in red
                              displayChar = typedChar;
                              status = 'incorrect';
                            } else {
                              // Within word length
                              if (typedChar === targetChar) {
                                status = isPast ? 'correct text-sub/50' : 'correct';
                                displayChar = targetChar;
                              } else {
                                // Mismatch: show what was typed instead of what was expected
                                displayChar = typedChar;
                                status = 'incorrect';
                              }
                            }
                          } else {
                            // No typed char at this position
                            if (isPast) {
                              // If past word and missing char, it's an error
                              status = 'incorrect';
                            }
                            displayChar = targetChar;
                          }

                          // Caret logic
                          const isCaretPos = isCurrent && i === inputLen;

                          charsToRender.push(
                            <span
                              key={i}
                              className={`letter ${status} ${isCaretPos ? 'active' : ''} ${isExtra ? 'opacity-70' : ''}`}
                            >
                              {displayChar}
                              {isCaretPos && <div className="caret" />}
                            </span>
                          );
                        }

                        // If caret is at the very end (inputLen == maxLen), append standalone caret
                        if (isCurrent && inputLen === maxLen) {
                          charsToRender.push(
                            <span key="caret-end" className="letter active relative w-0">
                              <div className="caret" />
                            </span>
                          );
                        }

                        return charsToRender;
                      })()}
                    </div>
                    {/* Gender Indicator Bar */}
                    {word.gram && (
                      <div className={`h-1 w-full rounded-full mt-0.5 transition-colors ${word.gram === '0' ? 'bg-red-400/80' :
                        word.gram === '1' ? 'bg-blue-400/80' :
                          word.gram === '2' ? 'bg-yellow-400/80' : 'bg-transparent'
                        }`} />
                    )}
                    {/* Bottom Hint: Romaji for JP, nothing/hidden for DE/FR */}
                    <span className="text-sub/40 text-xs mt-1 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                      {word.romaji}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      <footer className="mt-auto pt-16 text-sub text-sm">
        <p>
          {language === 'jp' ? 'Type in Romaji → Kana' : 'Type the word exactly'} | Space = skip word | Esc = restart
        </p>
      </footer>
    </div>
  );
};

export default App;
