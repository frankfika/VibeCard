import { useState, useRef, type ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ThumbsUp, Share2, Plus, X, Image as ImageIcon, MoreHorizontal, MessageCircle } from 'lucide-react';
import { useProfile } from '../store';
import { emit as chainEmit } from '../lib/chain/chain';
import ProofPill from '../components/chain/ProofPill';

const TAGS = ['All', 'Work', 'Life', 'Web3', 'Thoughts'];

interface Thread {
  id: string;
  author: {
    name: string;
    avatar: string;
    handle: string;
  };
  content: string;
  images?: string[];
  tags: string[];
  likes: number;
  timestamp: string;
  isLiked: boolean;
  proofId?: string;
}

const MOCK_THREADS: Thread[] = [
  {
    id: '1',
    author: {
      name: 'Alex Chen',
      avatar: 'https://api.dicebear.com/7.x/notionists/svg?seed=Alex&backgroundColor=transparent',
      handle: '0x1234...5678',
    },
    content: '刚刚完成了 vibecard 的 2.0 设计系统重构，采用了更现代的毛玻璃风格和物理弹簧动画。感觉整个应用变得更有呼吸感了。',
    images: ['https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop'],
    tags: ['Work', 'Web3'],
    likes: 24,
    timestamp: '2 hours ago',
    isLiked: false,
  },
  {
    id: '2',
    author: {
      name: 'Sarah Wang',
      avatar: 'https://api.dicebear.com/7.x/notionists/svg?seed=Sarah&backgroundColor=transparent',
      handle: 'sarah.eth',
    },
    content: '今天在咖啡馆里遇到了两个同样在做独立开发的 Builder。Web3 的圈子真小，但是大家都好有热情！',
    tags: ['Life', 'Thoughts'],
    likes: 12,
    timestamp: '5 hours ago',
    isLiked: true,
  },
];

export default function ThreadsPage() {
  const [activeTag, setActiveTag] = useState('All');
  const [threads, setThreads] = useState(MOCK_THREADS);
  const [isPublishing, setIsPublishing] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const isSharedView = new URLSearchParams(window.location.search).has('c');

  const filteredThreads = activeTag === 'All' 
    ? threads 
    : threads.filter(t => t.tags.includes(activeTag));

  const handleLike = (id: string) => {
    setThreads(threads.map(t => {
      if (t.id === id) {
        return {
          ...t,
          likes: t.isLiked ? t.likes - 1 : t.likes + 1,
          isLiked: !t.isLiked
        };
      }
      return t;
    }));
  };

  const handleShare = async (thread: Thread) => {
    const url = `${window.location.origin}?t=${thread.id}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // fallback: do nothing
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background relative">
      {/* Header Tags - Horizontal Scroll */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="flex items-center gap-2 px-4 py-3 overflow-x-auto no-scrollbar">
          {TAGS.map(tag => (
            <button
              key={tag}
              onClick={() => setActiveTag(tag)}
              className={`whitespace-nowrap px-4 py-1.5 rounded-full text-[13px] font-semibold transition-all ${
                activeTag === tag
                  ? 'bg-foreground text-background shadow-sm'
                  : 'bg-secondary text-muted-foreground hover:bg-foreground/10 hover:text-foreground'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Threads Feed */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {filteredThreads.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-20 text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mb-4">
              <MessageCircle className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-[16px] font-bold text-foreground mb-1">暂无动态</h3>
            <p className="text-[13px] text-muted-foreground max-w-[200px]">
              {activeTag === 'All' ? '成为第一个发布动态的人吧！' : `该标签下还没有内容，换个标签试试`}
            </p>
          </motion.div>
        ) : (
          filteredThreads.map((thread, i) => (
            <motion.div
              key={thread.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-card/40 backdrop-blur-xl border border-border rounded-3xl p-5 shadow-sm"
            >
              {/* Author Info */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <img src={thread.author.avatar} alt={thread.author.name} className="w-10 h-10 rounded-full bg-secondary" />
                  <div>
                    <h3 className="text-[15px] font-bold text-foreground leading-tight">{thread.author.name}</h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[12px] text-muted-foreground">{thread.author.handle}</span>
                      <span className="text-[12px] text-muted-foreground">·</span>
                      <span className="text-[12px] text-muted-foreground">{thread.timestamp}</span>
                    </div>
                  </div>
                </div>
                <button className="text-muted-foreground hover:text-foreground p-2 -mr-2">
                  <MoreHorizontal className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <p className="text-[15px] text-foreground leading-relaxed mb-4">
                {thread.content}
              </p>

              {/* Optional Images */}
              {thread.images && thread.images.length > 0 && (
                <div className={`grid gap-2 mb-4 ${
                  thread.images.length === 1 ? 'grid-cols-1' : 
                  thread.images.length === 2 ? 'grid-cols-2' : 
                  'grid-cols-3'
                }`}>
                  {thread.images.map((img, idx) => (
                    <div key={idx} className={`w-full rounded-2xl overflow-hidden bg-secondary ${
                      thread.images!.length === 1 ? 'aspect-video' : 'aspect-square'
                    }`}>
                      <img src={img} alt={`Thread media ${idx}`} className="w-full h-full object-cover cursor-pointer" onClick={() => setPreviewImage(img)} />
                    </div>
                  ))}
                </div>
              )}

              {/* Tags */}
              <div className="flex flex-wrap gap-2 mb-4 items-center">
                {thread.tags.map(tag => (
                  <span key={tag} className="text-[12px] font-semibold text-muted-foreground bg-secondary px-2 py-1 rounded-md">
                    #{tag}
                  </span>
                ))}
                {thread.proofId && (
                  <ProofPill hash={thread.proofId} variant="subtle" label="" />
                )}
              </div>

              {/* Interactions - No Comments */}
              {!isSharedView && (
                <div className="flex items-center gap-6 border-t border-border pt-3">
                  <button 
                    onClick={() => handleLike(thread.id)}
                    className={`flex items-center gap-1.5 transition-colors ${thread.isLiked ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    <ThumbsUp className={`w-5 h-5 ${thread.isLiked ? 'fill-current' : ''}`} />
                    <span className="text-[13px] font-medium">{thread.likes > 0 ? thread.likes : 'Like'}</span>
                  </button>
                  
                  <button 
                    onClick={() => handleShare(thread)}
                    className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Share2 className="w-5 h-5" />
                    <span className="text-[13px] font-medium">Share</span>
                  </button>
                </div>
              )}
            </motion.div>
          ))
        )}
        
        {/* Bottom padding for tab bar */}
        <div className="h-20" />
      </div>

      {/* Floating Action Button */}
      {!isSharedView && (
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsPublishing(true)}
          aria-label="发布动态"
          className="tap-target fixed right-5 sm:right-6 w-14 h-14 bg-foreground text-background rounded-full shadow-lg flex items-center justify-center z-20"
          style={{ bottom: 'calc(80px + env(safe-area-inset-bottom))' }}
        >
          <Plus className="w-6 h-6" />
        </motion.button>
      )}

      {/* Publish Modal/Drawer */}
      <AnimatePresence>
        {isPublishing && (
          <PublishModal 
            onClose={() => setIsPublishing(false)} 
            onPublish={(newThread) => {
              setThreads([newThread, ...threads]);
              setIsPublishing(false);
            }} 
          />
        )}
      </AnimatePresence>

      {/* Image Preview Lightbox */}
      {previewImage && (
        <ImagePreview src={previewImage} onClose={() => setPreviewImage(null)} />
      )}
    </div>
  );
}

function PublishModal({ onClose, onPublish }: { onClose: () => void, onPublish: (t: Thread) => void }) {
  const { profile } = useProfile();
  const [content, setContent] = useState('');
  const [selectedTag, setSelectedTag] = useState(TAGS[1]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);

  const handlePublish = async () => {
    if (!content.trim() && imagePreviews.length === 0) return;

    const id = Date.now().toString();
    let proofId: string | undefined;
    try {
      const tx = await chainEmit('thread.publish', {
        id, len: content.length, images: imagePreviews.length, tag: selectedTag,
      });
      proofId = tx.tx.id;
    } catch {}

    onPublish({
      id,
      author: {
        name: profile.name || 'Anonymous',
        avatar: profile.avatar || 'https://api.dicebear.com/7.x/notionists/svg?seed=fallback&backgroundColor=transparent',
        handle: profile.handle || '0x...'
      },
      content,
      images: imagePreviews.length > 0 ? imagePreviews : undefined,
      tags: [selectedTag],
      likes: 0,
      timestamp: 'Just now',
      isLiked: false,
      proofId,
    });
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = () => {
    if (imagePreviews.length >= 3) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      if (result) setImagePreviews([...imagePreviews, result]);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const removeImage = (indexToRemove: number) => {
    setImagePreviews(imagePreviews.filter((_, index) => index !== indexToRemove));
  };

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50" onClick={onClose} />
      <motion.div 
        initial={{ y: "100%" }} 
        animate={{ y: 0 }} 
        exit={{ y: "100%" }} 
        transition={{ type: "spring", damping: 25, stiffness: 200 }} 
        className="fixed inset-x-0 bottom-0 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:bottom-auto md:top-1/2 md:-translate-y-1/2 md:w-full md:max-w-md bg-background rounded-t-3xl md:rounded-3xl p-5 z-50 border border-border shadow-xl h-[90vh] md:h-auto flex flex-col"
      >
        <div className="flex items-center justify-between mb-4">
          <button onClick={onClose} className="p-2 -ml-2 rounded-full hover:bg-secondary">
            <X className="w-5 h-5 text-foreground" />
          </button>
          <span className="font-bold text-[16px]">新动态</span>
          <button 
            onClick={handlePublish}
            disabled={!content.trim() && imagePreviews.length === 0}
            className="px-4 py-1.5 bg-foreground text-background rounded-full text-[14px] font-bold disabled:opacity-50"
          >
            发布
          </button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar">
          <div className="flex gap-3 mb-4">
            <img src={profile.avatar || 'https://api.dicebear.com/7.x/notionists/svg?seed=fallback&backgroundColor=transparent'} className="w-10 h-10 rounded-full bg-secondary shrink-0" alt="avatar" />
            <textarea 
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="分享点什么..." 
              className="w-full bg-transparent text-[16px] leading-relaxed resize-none outline-none min-h-[120px] placeholder:text-muted-foreground"
              autoFocus
            />
          </div>

          {imagePreviews.length > 0 && (
            <div className={`grid gap-2 mb-4 ml-13 ${
              imagePreviews.length === 1 ? 'grid-cols-1' : 
              imagePreviews.length === 2 ? 'grid-cols-2' : 
              'grid-cols-3'
            }`}>
              {imagePreviews.map((img, idx) => (
                <div key={idx} className={`relative rounded-2xl overflow-hidden bg-secondary ${
                  imagePreviews.length === 1 ? 'aspect-video' : 'aspect-square'
                }`}>
                  <img src={img} className="w-full h-full object-cover" alt={`preview ${idx}`} />
                  <button 
                    onClick={() => removeImage(idx)}
                    className="absolute top-2 right-2 p-1.5 bg-black/50 backdrop-blur-md rounded-full text-white hover:bg-black/70"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-auto pt-4 border-t border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              onClick={handleImageUpload}
              disabled={imagePreviews.length >= 3}
              className="p-2 rounded-full hover:bg-secondary text-foreground transition-colors disabled:opacity-30"
            >
              <ImageIcon className="w-5 h-5" />
            </button>
            <span className="text-[12px] font-semibold text-muted-foreground">
              {imagePreviews.length}/3
            </span>
          </div>
          
          <select 
            value={selectedTag}
            onChange={e => setSelectedTag(e.target.value)}
            className="bg-secondary text-foreground text-[13px] font-semibold px-3 py-1.5 rounded-lg outline-none appearance-none cursor-pointer"
          >
            {TAGS.slice(1).map(tag => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
        </div>
      </motion.div>
    </>
  );
}

function ImagePreview({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 p-2 text-white/70 hover:text-white">
        <X className="w-6 h-6" />
      </button>
      <img src={src} alt="Preview" className="max-w-full max-h-full object-contain" onClick={e => e.stopPropagation()} />
    </div>
  );
}
