import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, Volume2, VolumeX, Maximize, ChevronLeft, ChevronRight, Download, ExternalLink } from 'lucide-react';
import './PostMedia.css';

const PostMedia = ({ media, postType, nsfw, spoiler, postId, onView }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isHovering, setIsHovering] = useState(false);
  const [showSpoiler, setShowSpoiler] = useState(spoiler);
  const [showNSFW, setShowNSFW] = useState(nsfw);
  const [quality, setQuality] = useState('auto');
  const [videoProgress, setVideoProgress] = useState(0);
  const videoRef = useRef(null);
  const hoverTimeoutRef = useRef(null);

  useEffect(() => {
    if (onView && !showSpoiler && !showNSFW) {
      onView(postId, currentIndex);
    }
  }, [currentIndex, showSpoiler, showNSFW]);

  if (!media || media.length === 0) return null;

  const currentMedia = media[currentIndex];
  const hasMultiple = media.length > 1;
  const handleMouseEnter = () => {
    setIsHovering(true);
    if (currentMedia.type === 'video' && videoRef.current && !isPlaying) {
      hoverTimeoutRef.current = setTimeout(() => {
        videoRef.current.play();
        setIsPlaying(true);
      }, 500); // 500ms delay before auto-play
    }
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    if (currentMedia.type === 'video' && videoRef.current && isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const togglePlayPause = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleVideoProgress = () => {
    if (videoRef.current) {
      const progress = (videoRef.current.currentTime / videoRef.current.duration) * 100;
      setVideoProgress(progress);
    }
  };

  const handleQualityChange = (newQuality) => {
    if (videoRef.current && currentMedia.metadata?.hlsManifest) {
      const currentTime = videoRef.current.currentTime;
      setQuality(newQuality);
      // Update video source based on quality
      const qualityUrl = newQuality === 'auto' 
        ? currentMedia.metadata.hlsManifest 
        : currentMedia.url.replace(/\/[^/]*$/, `/${newQuality}/playlist.m3u8`);
      videoRef.current.src = qualityUrl;
      videoRef.current.currentTime = currentTime;
      if (isPlaying) videoRef.current.play();
    }
  };

  const handleFullscreen = () => {
    if (videoRef.current) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen();
      } else if (videoRef.current.webkitRequestFullscreen) {
        videoRef.current.webkitRequestFullscreen();
      }
    }
  };

  const nextMedia = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % media.length);
    setIsPlaying(false);
    setVideoProgress(0);
  };

  const prevMedia = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentIndex((prev) => (prev - 1 + media.length) % media.length);
    setIsPlaying(false);
    setVideoProgress(0);
  };

  const renderBlurOverlay = () => (
    <div className="media-blur-overlay">
      <div className="media-blur-content">
        <h3>{nsfw ? 'NSFW Content' : 'Spoiler'}</h3>
        <p>{nsfw ? 'This content is not safe for work' : 'This post contains spoilers'}</p>
        <button 
          className="reveal-button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (nsfw) setShowNSFW(false);
            if (spoiler) setShowSpoiler(false);
          }}
        >
          Click to reveal
        </button>
      </div>
    </div>
  );

  const renderVideoControls = () => (
    <AnimatePresence>
      {(isHovering || !isPlaying) && (
        <motion.div
          className="video-controls"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="video-controls-top">
            <div className="quality-selector">
              <select 
                value={quality} 
                onChange={(e) => handleQualityChange(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              >
                <option value="auto">Auto</option>
                {currentMedia.metadata?.qualities?.map(q => (
                  <option key={q} value={q}>{q}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="video-controls-center">
            <button className="play-button" onClick={togglePlayPause}>
              {isPlaying ? <Pause size={48} /> : <Play size={48} />}
            </button>
          </div>

          <div className="video-controls-bottom">
            <div className="video-progress-bar">
              <div 
                className="video-progress-fill" 
                style={{ width: `${videoProgress}%` }}
              />
            </div>
            <div className="video-control-buttons">
              <button onClick={toggleMute}>
                {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>
              <span className="video-duration">
                {currentMedia.metadata?.duration 
                  ? `${Math.floor(currentMedia.metadata.duration / 60)}:${String(Math.floor(currentMedia.metadata.duration % 60)).padStart(2, '0')}`
                  : '0:00'}
              </span>
              <button onClick={handleFullscreen}>
                <Maximize size={20} />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  const renderMedia = () => {
    if (showSpoiler || showNSFW) {
      return (
        <div className="media-container blurred">
          {renderBlurOverlay()}
        </div>
      );
    }

    switch (currentMedia.type) {
      case 'video':
        return (
          <div 
            className="media-container video-container"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <video
              ref={videoRef}
              className="post-video"
              poster={currentMedia.thumbnail}
              muted={isMuted}
              loop
              playsInline
              onTimeUpdate={handleVideoProgress}
              onClick={togglePlayPause}
            >
              <source 
                src={currentMedia.metadata?.hlsManifest || currentMedia.url} 
                type={currentMedia.metadata?.mimeType || 'video/mp4'} 
              />
              Your browser does not support the video tag.
            </video>
            {renderVideoControls()}
            {hasMultiple && (
              <div className="media-navigation">
                <button className="nav-button prev" onClick={prevMedia}>
                  <ChevronLeft size={24} />
                </button>
                <button className="nav-button next" onClick={nextMedia}>
                  <ChevronRight size={24} />
                </button>
              </div>
            )}
          </div>
        );

      case 'gif':
        return (
          <div className="media-container gif-container">
            <img 
              src={currentMedia.url} 
              alt={currentMedia.caption || 'GIF'} 
              className="post-gif"
            />
            {hasMultiple && (
              <div className="media-navigation">
                <button className="nav-button prev" onClick={prevMedia}>
                  <ChevronLeft size={24} />
                </button>
                <button className="nav-button next" onClick={nextMedia}>
                  <ChevronRight size={24} />
                </button>
              </div>
            )}
          </div>
        );

      case 'image':
        return (
          <div className="media-container image-container">
            <img 
              src={currentMedia.url} 
              alt={currentMedia.caption || 'Post image'} 
              className="post-image"
              loading="lazy"
            />
            {currentMedia.caption && (
              <div className="media-caption">{currentMedia.caption}</div>
            )}
            {hasMultiple && (
              <div className="media-navigation">
                <button className="nav-button prev" onClick={prevMedia}>
                  <ChevronLeft size={24} />
                </button>
                <button className="nav-button next" onClick={nextMedia}>
                  <ChevronRight size={24} />
                </button>
              </div>
            )}
          </div>
        );

      case 'audio':
        return (
          <div className="media-container audio-container">
            <audio controls className="post-audio">
              <source src={currentMedia.url} type={currentMedia.metadata?.mimeType || 'audio/mpeg'} />
              Your browser does not support the audio tag.
            </audio>
            {currentMedia.caption && (
              <div className="media-caption">{currentMedia.caption}</div>
            )}
          </div>
        );

      case 'document':
        return (
          <div className="media-container document-container">
            <div className="document-preview">
              <div className="document-icon">📄</div>
              <div className="document-info">
                <h4>{currentMedia.metadata?.filename || 'Document'}</h4>
                <p>{currentMedia.metadata?.size ? `${(currentMedia.metadata.size / 1024 / 1024).toFixed(2)} MB` : ''}</p>
              </div>
              <div className="document-actions">
                <a 
                  href={currentMedia.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="document-button"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink size={20} />
                  View
                </a>
                <a 
                  href={currentMedia.url} 
                  download={currentMedia.metadata?.filename}
                  className="document-button"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Download size={20} />
                  Download
                </a>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="post-media">
      {renderMedia()}
      {hasMultiple && (
        <div className="media-indicators">
          {media.map((_, index) => (
            <button
              key={index}
              className={`media-indicator ${index === currentIndex ? 'active' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCurrentIndex(index);
              }}
            />
          ))}
        </div>
      )}
      {hasMultiple && (
        <div className="media-counter">
          {currentIndex + 1} / {media.length}
        </div>
      )}
    </div>
  );
};

export default PostMedia;
