import { useState, useEffect, useRef } from 'react';

/**
 * Componente che visualizza testo Gherkin con box arancioni per gli oggetti EC
 */
export function GherkinTextWithHighlights({ text, testCaseId, boxType, ecObjects = [] }) {
  const textRef = useRef(null);
  const [objectPositions, setObjectPositions] = useState([]);

  // Filtra gli oggetti per questo test case e box type
  const relevantObjects = ecObjects.filter(obj => 
    obj.testCaseId === String(testCaseId) && 
    obj.boxType === boxType &&
    obj.location === 'header' // Solo oggetti header (nel testo GWT)
  );

  // Calcola le posizioni dei box arancioni
  useEffect(() => {
    if (relevantObjects.length === 0 || !textRef.current || !text) {
      setObjectPositions([]);
      return;
    }

    const calculatePositions = () => {
      if (!textRef.current) return;

      const textElement = textRef.current;
      const range = document.createRange();
      const positions = [];

      for (const obj of relevantObjects) {
        try {
          // Trova il nodo di testo
          const walker = document.createTreeWalker(
            textElement,
            NodeFilter.SHOW_TEXT,
            null,
            false
          );

          let charCount = 0;
          let startNode = null;
          let endNode = null;
          let startOffset = 0;
          let endOffset = 0;

          let node;
          while ((node = walker.nextNode())) {
            const nodeLength = node.textContent.length;
            const nodeStart = charCount;
            const nodeEnd = charCount + nodeLength;

            if (startNode === null && nodeEnd >= obj.startIndex) {
              startNode = node;
              startOffset = Math.max(0, obj.startIndex - nodeStart);
            }

            if (nodeEnd >= obj.endIndex) {
              endNode = node;
              endOffset = Math.min(nodeLength, obj.endIndex - nodeStart);
              break;
            }

            charCount += nodeLength;
          }

          if (startNode && endNode) {
            range.setStart(startNode, startOffset);
            range.setEnd(endNode, endOffset);

            // Usa getClientRects() per supportare testo multi-linea
            const rangeRects = range.getClientRects();
            const containerRect = textElement.getBoundingClientRect();

            const rects = Array.from(rangeRects).map(rect => ({
              left: rect.left - containerRect.left,
              top: rect.top - containerRect.top,
              width: Math.max(rect.width, 10),
              height: Math.max(rect.height, 16)
            }));

            if (rects.length > 0) {
              positions.push({
                id: obj.id || obj.ecObjectId,
                text: obj.text,
                rects: rects
              });
            }
          }
        } catch (error) {
          console.warn('Errore calcolo posizione oggetto:', error, obj);
        }
      }

      setObjectPositions(positions);
    };

    // Calcola inizialmente
    const timeoutId = setTimeout(calculatePositions, 50);

    // Ricalcola su resize
    const handleUpdate = () => calculatePositions();
    window.addEventListener('resize', handleUpdate);

    // Observer per cambiamenti nel DOM
    const resizeObserver = new ResizeObserver(() => {
      calculatePositions();
    });

    if (textRef.current) {
      resizeObserver.observe(textRef.current);
    }

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', handleUpdate);
      resizeObserver.disconnect();
    };
  }, [text, relevantObjects]);

  return (
    <span style={{ position: 'relative', display: 'inline-block', minHeight: '1.5em', paddingTop: '2px', paddingBottom: '2px' }}>
      <span 
        ref={textRef}
        style={{ 
          position: 'relative',
          display: 'inline',
          lineHeight: '1.5',
          whiteSpace: 'pre-wrap'
        }}
      >
        {text}
      </span>

      {/* Overlay con i box arancioni */}
      {objectPositions.length > 0 && (
        <span
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            overflow: 'visible',
            zIndex: 1
          }}
        >
          {objectPositions.map((pos) =>
            pos.rects.map((rect, rectIdx) => (
              <span
                key={`${pos.id}-rect-${rectIdx}`}
                title={`EC Object: ${pos.text}`}
                style={{
                  position: 'absolute',
                  left: `${rect.left}px`,
                  top: `${rect.top}px`,
                  width: `${rect.width}px`,
                  height: `${rect.height}px`,
                  border: '2px dashed #ff9800',
                  borderRadius: '3px',
                  backgroundColor: 'rgba(255, 152, 0, 0.08)',
                  boxSizing: 'border-box',
                  pointerEvents: 'none',
                  display: 'block'
                }}
              />
            ))
          )}
        </span>
      )}
    </span>
  );
}

