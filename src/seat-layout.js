const ARC_START_DEGREES = 168;
const ARC_END_DEGREES = 12;
const ARC_CENTER = {x: 50, y: 30};
const ARC_RADIUS = {x: 43, y: 58};

export function buildSeatPositions(count) {
    return Array.from({length: count}, (_, index) => {
        const progress = count === 1 ? 0.5 : index / (count - 1);
        const radians = ((ARC_START_DEGREES + (ARC_END_DEGREES - ARC_START_DEGREES) * progress) * Math.PI) / 180;
        return {x: ARC_CENTER.x + ARC_RADIUS.x * Math.cos(radians), y: ARC_CENTER.y + ARC_RADIUS.y * Math.sin(radians)};
    });
}
