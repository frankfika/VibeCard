import { forwardRef } from 'react';
import { MapPin, Zap, Check } from 'lucide-react';
import { type Profile } from '../store';

export const ShareCardTemplate = forwardRef<HTMLDivElement, { profile: Profile }>(({ profile }, ref) => {
  const avatarUrl = profile.avatar || `https://api.dicebear.com/7.x/notionists/svg?seed=${profile.name}&backgroundColor=transparent`;

  return (
    <div 
      ref={ref} 
      className="absolute top-[-9999px] left-[-9999px] w-[750px] h-[1000px] bg-[#0a0a0a] overflow-hidden flex flex-col justify-between"
      style={{
        backgroundImage: 'radial-gradient(circle at 50% 0%, #1a1a1a 0%, #0a0a0a 70%)'
      }}
    >
      <div className="p-16 flex flex-col items-center flex-1 text-center">
        <div className="w-[180px] h-[180px] rounded-[48px] mb-8 relative shadow-2xl bg-[#1a1a1a]">
          <img src={avatarUrl} className="w-full h-full rounded-[48px] object-cover border-4 border-white/10" alt="avatar" />
          {profile.verified?.wallet && (
            <div className="absolute -bottom-4 -right-4 w-12 h-12 bg-white rounded-full border-4 border-[#0a0a0a] flex items-center justify-center">
              <Check className="w-6 h-6 text-black stroke-[3]" />
            </div>
          )}
        </div>
        
        <h1 className="text-[64px] font-black tracking-tight text-white mb-3 leading-none">{profile.name}</h1>
        {profile.handle && <div className="text-[28px] font-bold text-white/60 mb-6">{profile.handle}</div>}
        
        {profile.event && (
          <div className="px-6 py-3 rounded-full bg-white/10 flex items-center gap-2.5 text-[24px] font-bold text-white/80 mb-8 backdrop-blur-md">
            <MapPin className="w-6 h-6" />
            {profile.event}
          </div>
        )}

        {profile.tags?.length > 0 && (
          <div className="flex flex-wrap justify-center gap-3 mb-10">
            {profile.tags.slice(0, 5).map((tag: any) => (
              <span key={tag.label} className="px-6 py-3 rounded-full text-[24px] font-bold bg-white/5 border border-white/10 text-white backdrop-blur-md">
                {tag.label}
              </span>
            ))}
          </div>
        )}

        {profile.bio && (
          <p className="text-[28px] leading-relaxed font-medium text-white/80 text-center line-clamp-3 px-8">
            {profile.bio}
          </p>
        )}

        {/* 动态预览 */}
        <div className="w-full mt-10 bg-white/5 border border-white/10 rounded-[32px] p-8 text-left backdrop-blur-md relative overflow-hidden">
          <div className="absolute top-0 left-0 w-2 h-full bg-white/20" />
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
              <span className="text-[20px]">✨</span>
            </div>
            <span className="text-[22px] font-bold text-white/60">最新动态</span>
          </div>
          <p className="text-[26px] font-medium text-white leading-relaxed line-clamp-2">
            "刚刚更新了我的 Web3 社交名片，快来看看吧！"
          </p>
        </div>
      </div>

      <div className="bg-white/5 backdrop-blur-3xl border-t border-white/10 p-12 flex justify-between items-center">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center">
            <Zap className="w-8 h-8 text-black" />
          </div>
          <div className="text-left">
            <div className="text-[20px] font-bold text-white/50 uppercase tracking-widest mb-1">vibecard</div>
            <div className="text-[28px] font-bold text-white">一张卡片，连接无限可能</div>
          </div>
        </div>
        
        <div className="w-32 h-32 bg-white rounded-2xl p-2 flex items-center justify-center shadow-xl">
           <div className="text-[20px] font-bold text-black text-center leading-tight">长按<br/>扫码</div>
        </div>
      </div>
    </div>
  );
});