import {MapPin, Utensils, Heart, MessageCircle, Bookmark, Camera, Coffee} from 'lucide-react'
import styles from './evidence-mockups.module.css'

export function MapMockup({restaurant}:{restaurant:string}) {
  return <div className={styles.scene} role="img" aria-label={`Illustrative local map for ${restaurant}`}>
    <div className={styles.map} aria-hidden="true">
      <svg viewBox="0 0 360 360" preserveAspectRatio="xMidYMid slice" className={styles.streets}>
        <rect width="360" height="360" fill="#edf0e7"/>
        <path d="M270 -20 Q210 90 285 180 T280 390" fill="none" stroke="#c9e3e7" strokeWidth="38"/>
        <g fill="#d7e4cf"><rect x="15" y="25" width="76" height="66" rx="18"/><rect x="130" y="236" width="83" height="93" rx="22"/></g>
        <g fill="#e1ddcf"><rect x="120" y="24" width="66" height="43" rx="6"/><rect x="23" y="136" width="45" height="52" rx="5"/><rect x="110" y="120" width="62" height="52" rx="5"/><rect x="29" y="236" width="60" height="68" rx="5"/><rect x="305" y="50" width="44" height="70" rx="5"/></g>
        <g fill="none" stroke="#fff" strokeWidth="12"><path d="M-20 108 L380 85 M-20 212 L380 192 M99 -20 L91 380 M213 -20 L224 380 M-20 340 L380 307"/></g>
        <path d="M-10 285 Q140 173 370 140" fill="none" stroke="#ead5a9" strokeWidth="18"/><path d="M-10 285 Q140 173 370 140" fill="none" stroke="#fff8e8" strokeWidth="12"/>
      </svg>
      <span className={styles.ring}/><span className={`${styles.ring} ${styles.delayed}`}/>
      <span className={styles.mainPin}><MapPin size={32} fill="currentColor" stroke="white"/></span>
      {[[22,29],[75,30],[27,73]].map(([left,top],i)=><span key={i} className={styles.pin} style={{left:`${left}%`,top:`${top}%`,animationDelay:`${i*1.5}s`}}><Utensils size={13}/></span>)}
    </div>
    <div className={styles.badge}><span/>Local area overview</div>
    <div className={styles.caption}><MapPin size={17}/><span>{restaurant}<small>Exploring the neighbourhood</small></span></div>
  </div>
}

export function SocialMockup({restaurant}:{restaurant:string}) {
  return <div className={`${styles.scene} ${styles.social}`} role="img" aria-label={`Illustrative social feed for ${restaurant}`}>
    <div className={styles.feed} aria-hidden="true">
      <div className={styles.profile}><span className={styles.avatar}><Utensils size={18}/></span><strong>{restaurant}<small>Social presence</small></strong><Camera size={18}/></div>
      <div className={styles.stories}>{[Utensils,Camera,Coffee,Heart].map((Icon,i)=><span key={i}><Icon size={16}/></span>)}</div>
      <div className={styles.tiles}>{[Utensils,Coffee,Camera,Heart,Camera,Utensils].map((Icon,i)=><div key={i} style={{animationDelay:`${i*.7}s`}}><Icon size={27}/></div>)}</div>
      <div className={styles.actions}><Heart size={17}/><MessageCircle size={17}/><Bookmark size={17}/></div>
      <div className={styles.line}/><div className={styles.shortLine}/>
    </div>
    <div className={styles.scan} aria-hidden="true"/>
    <div className={styles.socialCaption}>Content · Activity · Connections</div>
  </div>
}
