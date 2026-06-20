import { useState, useRef, useMemo, type ChangeEvent, type KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ThumbsUp, Share2, Plus, X, Image as ImageIcon, MoreHorizontal, MessageCircle } from 'lucide-react';
import { useProfile, type Thread } from '../store';
import { emit as chainEmit } from '../lib/chain/chain';
import { award as awardPoints } from '../lib/web3/points';
import { useToast } from '../components/ui/ToastProvider';
import ProofPill from '../components/chain/ProofPill';

const DEFAULT_TAGS = ['Work', 'Life', 'Web3', 'Thoughts'];

function getAllTags(threads: Thread[]) {
  const tags = new Set<string>();
  threads.forEach(t => t.tags.forEach(tag => tags.add(tag)));
  return ['All', ...Array.from(tags)];
}

function formatTime(ts: number) {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 7) return `${days} 天前`;
  return new Date(ts).toLocaleDateString('zh-CN');
}

export default function ThreadsPage() {
  const { profile, updateProfile } = useProfile();
  const toast = useToast();
  const [activeTag, setActiveTag] = useState('All');
  const [isPublishing, setIsPublishing] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const isSharedView = new URLSearchParams(window.location.search).has('c');

  const threads = profile.threads || [];
  const allTags = useMemo(() => getAllTags(threads), [threads]);

  const filteredThreads = activeTag === 'All'
    ? threads
    : threads.filter(t => t.tags.includes(activeTag));

  const handleDelete = (id: string) => {
    if (confirm('确定要删除这条动态吗？')) {
      updateProfile({ threads: threads.filter(t => t.id !== id) });
    }
  };

  const handlePublish = (newThread: Thread) => {
    updateProfile({ threads: [newThread, ...threads] });
    chainEmit('thread.publish', { id: newThread.id }).catch(() => {});
    const res = awardPoints('thread_publish');
    if (res.ok) {
      toast.show({ message: `发布成功，+${res.awarded} 积分`, type: 'success', duration: 2500 });
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background relative">
      {/* Header Tags - Horizontal Scroll */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="flex items-center gap-2 px-4 py-3 overflow-x-auto no-scrollbar">
          {allTags.map(tag => (
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
            <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mb-4 border border-white/5 shadow-sm">
              <MessageCircle className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-[16px] font-bold text-foreground mb-1">暂无个人动态</h3>
            <p className="text-[13px] text-muted-foreground max-w-[200px]">
              {activeTag === 'All' ? '记录一下你最近的进展、想法或高光时刻吧。' : `该标签下还没有内容，换个标签试试`}
            </p>
          </motion.div>
        ) : (
          filteredThreads.map((thread, i) => (
            <motion.div
              key={thread.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-card/40 backdrop-blur-xl border border-white/5 rounded-[24px] p-5 shadow-sm ring-1 ring-white/5 relative group"
            >
              {/* Header Info */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <img 
                    src={profile.avatar || `https://api.dicebear.com/7.x/notionists/svg?seed=${profile.name || 'default'}&backgroundColor=transparent`} 
                    alt={profile.name} 
                    className="w-8 h-8 rounded-full bg-secondary/50 border border-white/10" 
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-bold text-foreground">{profile.name || 'Anonymous'}</span>
                    <span className="text-[11px] font-medium text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded-md border border-white/5">
                      {formatTime(thread.timestamp)}
                    </span>
                  </div>
                </div>
                {!isSharedView && (
                  <button onClick={() => handleDelete(thread.id)} className="text-muted-foreground/50 hover:text-red-400 p-1.5 rounded-full hover:bg-red-400/10 transition-colors opacity-0 group-hover:opacity-100">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Content */}
              <p className="text-[15px] font-medium text-foreground/90 leading-relaxed mb-4 whitespace-pre-wrap">
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
                    <div key={idx} className={`w-full rounded-[16px] overflow-hidden bg-secondary/50 border border-white/5 ${
                      thread.images!.length === 1 ? 'aspect-video' : 'aspect-square'
                    }`}>
                      <img src={img} alt={`Thread media ${idx}`} className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-500" onClick={() => setPreviewImage(img)} />
                    </div>
                  ))}
                </div>
              )}

              {/* Tags */}
              <div className="flex flex-wrap gap-2 items-center">
                {thread.tags.map(tag => (
                  <span key={tag} className="text-[11px] font-bold text-foreground/60 bg-secondary/40 border border-white/5 px-2 py-1 rounded-md">
                    #{tag}
                  </span>
                ))}
                {thread.proofId && (
                  <ProofPill hash={thread.proofId} variant="subtle" label="" />
                )}
              </div>
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
            onPublish={handlePublish}
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
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);

  const addTag = (raw: string) => {
    const tag = raw.trim().replace(/^#/, '').replace(/[,，]/g, '');
    if (!tag || tags.includes(tag)) return;
    setTags([...tags, tag]);
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  const handleTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
      e.preventDefault();
      addTag(tagInput);
      setTagInput('');
    } else if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
      setTags(tags.slice(0, -1));
    }
  };

  const handlePublish = async () => {
    if (!content.trim() && imagePreviews.length === 0) return;

    const id = Date.now().toString();
    let proofId: string | undefined;
    try {
      const tx = await chainEmit('thread.publish', {
        id, len: content.length, images: imagePreviews.length, tags,
      });
      proofId = tx.tx.id;
    } catch (err) {
      console.warn('chainEmit failed:', err);
    }

    onPublish({
      id,
      content,
      images: imagePreviews.length > 0 ? imagePreviews : undefined,
      tags,
      timestamp: Date.now(),
      ...(proofId ? { proofId } : {}),
    });
    setContent('');
    setImagePreviews([]);
    setTags([]);
    setTagInput('');
    onClose();
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

        <div className="mt-auto pt-4 border-t border-border">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {tags.map(tag => (
              <span
                key={tag}
                className="flex items-center gap-1 text-[12px] font-semibold text-foreground bg-secondary pl-2.5 pr-1.5 py-1 rounded-full"
              >
                #{tag}
                <button
                  onClick={() => removeTag(tag)}
                  className="p-0.5 rounded-full hover:bg-foreground/10"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <input
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              onBlur={() => { addTag(tagInput); setTagInput(''); }}
              placeholder={tags.length ? '' : '添加标签，按回车确认'}
              className="bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground min-w-[120px] flex-1"
            />
          </div>

          {DEFAULT_TAGS.filter(t => !tags.includes(t)).length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {DEFAULT_TAGS.filter(t => !tags.includes(t)).map(tag => (
                <button
                  key={tag}
                  onClick={() => addTag(tag)}
                  className="text-[12px] font-medium text-muted-foreground bg-secondary/60 hover:bg-secondary px-2.5 py-1 rounded-full transition-colors"
                >
                  + {tag}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between">
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
          </div>
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
