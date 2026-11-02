import {useEffect, useState} from 'react';

const isTypingField = (target) => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/**
 * Toggles a hidden mode when the secret word is typed in a row, anywhere outside a form field.
 */
export function useSecretWord(secretWord) {
    const [isUnlocked, setIsUnlocked] = useState(false);

    useEffect(() => {
        let typed = '';
        const onKeyDown = (event) => {
            if (isTypingField(event.target) || event.key.length !== 1) return;
            typed = (typed + event.key.toLowerCase()).slice(-secretWord.length);
            if (typed === secretWord) {
                typed = '';
                setIsUnlocked((value) => !value);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [secretWord]);

    return isUnlocked;
}
