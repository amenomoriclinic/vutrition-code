"use client";

import { useState } from 'react';

export default function FloatingButton() {
  const [open, setOpen] = useState(false);

  const handleMainClick = () => {
    // Try to trigger the file input on the page for quick photo capture
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement | null;
    if (fileInput) {
      fileInput.click();
      return;
    }
    // fallback: toggle quick menu
    setOpen(!open);
  };

  const handleScrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  return (
    <div>
      <button className="fab" onClick={handleMainClick} aria-label="クイック記録">
        ➕
      </button>
      {open ? (
        <div className="fab-menu">
          <button onClick={handleScrollTop} className="fab-action">トップへ</button>
        </div>
      ) : null}
    </div>
  );
}
