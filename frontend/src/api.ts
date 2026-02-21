import axios from 'axios';

// Use VITE_API_BASE_URL from environment, fallback to localhost for local dev
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:3000/api';

export interface Word {
    id: number;
    romaji: string;
    word: string;
    pron: string;
    gram: string;
    level: number;
}

export interface Result {
    wpm: number;
    accuracy: number;
    timestamp: number;
}

export const fetchWords = async (lang: string = 'jp', level: number = 1): Promise<Word[]> => {
    const response = await axios.get(`${API_BASE_URL}/words?lang=${lang}&level=${level}`);
    return response.data;
};

export const submitResult = async (result: Result): Promise<void> => {
    await axios.post(`${API_BASE_URL}/results`, result);
};
