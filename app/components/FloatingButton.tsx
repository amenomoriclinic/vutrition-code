"use client";

// Quick photo capture. The page decides what a press does (switching to the meal
// screen and opening the photo picker), so this only renders the button.
export default function FloatingButton({ onPress }: { onPress: () => void }) {
  return (
    <button className="fab" onClick={onPress} aria-label="食事の写真を撮る">
      ➕
    </button>
  );
}
