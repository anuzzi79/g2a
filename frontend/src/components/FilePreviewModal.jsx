import React from 'react';
import '../styles/FilePreviewModal.css';

const FilePreviewModal = ({ file, onClose }) => {
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('it-IT');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <h2>📄 {file.name}</h2>
            <button className="close-button" onClick={onClose}>✖️</button>
          </div>
          <div className="file-info">
            <span className="info-item">📍 {file.path}</span>
            <span className="info-item">📦 {formatFileSize(file.size)}</span>
            <span className="info-item">🕒 {formatDate(file.lastModified)}</span>
          </div>
        </div>

        <div className="modal-body">
          <pre className="code-preview">
            <code>{file.content}</code>
          </pre>
        </div>

        <div className="modal-footer">
          <div className="footer-info">
            <span>⚠️ File di sola lettura - le modifiche non vengono salvate</span>
          </div>
          <button className="close-footer-button" onClick={onClose}>
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
};

export default FilePreviewModal;

