import {useEffect, useId, useLayoutEffect, useRef, useState} from 'react';

const VIEWPORT_MARGIN_PX = 8;

/**
 * Dropdown that opens downward, or upward when there is not enough room below it.
 */
export default function Select({value, options, onChange, label}) {
    const [isOpen, setIsOpen] = useState(false);
    const [isUpward, setIsUpward] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const container = useRef(null);
    const trigger = useRef(null);
    const list = useRef(null);
    const listId = useId();
    const selected = options.find((option) => option.value === value) ?? options[0];

    useLayoutEffect(() => {
        if (!isOpen || !trigger.current || !list.current) return;
        const triggerBox = trigger.current.getBoundingClientRect();
        const listHeight = list.current.offsetHeight;
        const spaceBelow = window.innerHeight - triggerBox.bottom - VIEWPORT_MARGIN_PX;
        const spaceAbove = triggerBox.top - VIEWPORT_MARGIN_PX;
        setIsUpward(spaceBelow < listHeight && spaceAbove > spaceBelow);
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return undefined;
        const closeOnOutsideClick = (event) => {
            if (!container.current?.contains(event.target)) setIsOpen(false);
        };
        document.addEventListener('pointerdown', closeOnOutsideClick);
        return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
    }, [isOpen]);

    const open = () => {
        setActiveIndex(Math.max(0, options.indexOf(selected)));
        setIsOpen(true);
    };

    const choose = (option) => {
        onChange(option.value);
        setIsOpen(false);
        trigger.current?.focus();
    };

    const onKeyDown = (event) => {
        if (!isOpen) {
            if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
                event.preventDefault();
                open();
            }
            return;
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            setIsOpen(false);
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIndex((index) => Math.min(options.length - 1, index + 1));
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((index) => Math.max(0, index - 1));
        } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            choose(options[activeIndex]);
        }
    };

    return (
        <div className="select" ref={container}>
            <button
                ref={trigger}
                type="button"
                className={`select-trigger${isOpen ? ' is-open' : ''}`}
                onClick={() => (isOpen ? setIsOpen(false) : open())}
                onKeyDown={onKeyDown}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-controls={listId}
                aria-label={label}
            >
                <span>{selected?.label}</span>
                <svg className="select-chevron" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
                    <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>
            {isOpen && (
                <ul ref={list} id={listId} role="listbox" className={`select-list${isUpward ? ' is-upward' : ''}`}>
                    {options.map((option, index) => (
                        <li
                            key={option.value}
                            role="option"
                            aria-selected={option.value === value}
                            className={`select-option${index === activeIndex ? ' is-active' : ''}${option.value === value ? ' is-selected' : ''}`}
                            onPointerEnter={() => setActiveIndex(index)}
                            onClick={() => choose(option)}
                        >
                            <span className="select-option-label">{option.label}</span>
                            {option.hint && <span className="muted small">{option.hint}</span>}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
