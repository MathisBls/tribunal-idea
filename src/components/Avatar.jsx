import {useEffect, useRef} from 'react';

import {mountClawd, pickVariant} from '../clawd-renderer.js';

const CANVAS_SCALE = 2;

export default function Avatar({persona, size = 'md', isSpeaking = false}) {
    const container = useRef(null);
    const canvas = useRef(null);
    const clawd = useRef(null);
    const personaId = persona?.id;
    const color = persona?.color;
    const variant = pickVariant(persona);

    useEffect(() => {
        if (!canvas.current || !container.current) return undefined;
        const pixelSize = Math.round(container.current.clientWidth * CANVAS_SCALE);
        canvas.current.width = pixelSize;
        canvas.current.height = pixelSize;
        const toneColor = getComputedStyle(container.current).getPropertyValue('--tone').trim();
        clawd.current = mountClawd(canvas.current, {variant, toneColor, seed: personaId});
        return () => clawd.current?.unmount();
    }, [personaId, color, variant]);

    useEffect(() => {
        clawd.current?.setSpeaking(isSpeaking);
    }, [isSpeaking]);

    return (
        <span ref={container} className={`avatar avatar-${size} tone-${color ?? 'slate'}${isSpeaking ? ' is-speaking' : ''}`} aria-hidden="true">
            <canvas ref={canvas} />
        </span>
    );
}
