// ============================================================
// MAHFOOZ — WelcomeScreen.js
// First impression. The Qur'an text dominates.
// Not a classroom. A threshold.
// ============================================================
import { t } from '../core/i18n.js';

export function renderWelcomeScreen(lang) {
  return `
    <div class="screen active parchment candlelight" data-screen="welcome"
         style="min-height:100vh; display:flex; flex-direction:column;
                background:var(--bg); position:relative; overflow:hidden;">

      <!-- Ambient radial glow — top center -->
      <div style="position:absolute; top:-10%; left:50%; transform:translateX(-50%);
                  width:500px; height:350px; border-radius:50%;
                  background:radial-gradient(ellipse, rgba(212,160,23,0.07) 0%, transparent 70%);
                  pointer-events:none; z-index:0;"></div>

      <!-- Lang pills — top right -->
      <div style="padding:16px 18px 0; display:flex; justify-content:flex-end;
                  position:relative; z-index:2;" class="fade-in">
        <div class="lang-pills">
          <button class="lang-pill ${lang==='en'?'active':''}" onclick="setLang('en')">EN</button>
          <button class="lang-pill ${lang==='hi'?'active':''}" onclick="setLang('hi')">HI</button>
          <button class="lang-pill ${lang==='ur'?'active':''}" onclick="setLang('ur')">UR</button>
        </div>
      </div>

      <!-- Center hero -->
      <div style="flex:1; display:flex; flex-direction:column; align-items:center;
                  justify-content:center; padding:20px 28px 0;
                  position:relative; z-index:2; text-align:center;">

        <!-- Logo -->
        <div style="width:100px; height:100px; border-radius:24px; overflow:hidden;
                    border:1px solid var(--border-gold-strong);
                    box-shadow:0 0 40px var(--gold-glow), var(--shadow-lg);
                    margin-bottom:24px; flex-shrink:0;"
             class="scale-in">
          <img class="mahfooz-logo" src="icons/logo-dark.png" alt="Mahfooz"
               style="width:100%; height:100%; object-fit:cover;">
        </div>

        <!-- App name -->
        <div class="fade-up" style="animation-delay:0.15s;">
          <div class="arabic" style="font-size:42px; color:var(--gold); line-height:1.4;
                                      margin-bottom:4px; letter-spacing:0.02em;">
            محفوظ
          </div>
          <div style="font-family:var(--font-display); font-size:1rem;
                      color:var(--ink-3); font-style:italic; margin-bottom:24px;">
            ${t('appTagline', lang)}
          </div>
        </div>

        <!-- The anchor ayah — Al-Hijr 15:9 — large, living -->
        <div class="fade-up" style="animation-delay:0.3s; width:100%;">
          <div style="background:var(--bg-elevated); border:1px solid var(--border-gold);
                      border-radius:var(--r-xl); padding:24px 20px 18px;
                      box-shadow:var(--shadow-md);">

            <!-- Gold top line -->
            <div style="height:1px; background:linear-gradient(90deg,transparent,var(--gold),transparent);
                        margin-bottom:20px; opacity:0.5;"></div>

            <div class="ayah-arabic" lang="ar" dir="rtl"
                 style="font-size:clamp(22px,5vw,30px); text-align:center;
                        margin-bottom:14px; line-height:2.4; color:var(--ink-arabic);">
              إِنَّا نَحْنُ نَزَّلْنَا ٱلذِّكْرَ وَإِنَّا لَهُۥ لَحَٰفِظُونَ
            </div>

            <div style="font-family:var(--font-display); font-size:0.875rem;
                        font-style:italic; color:var(--ink-3); line-height:1.7;
                        text-align:center; margin-bottom:8px;">
              ${lang === 'ur'
                ? '"بے شک ہم نے ہی یہ ذکر نازل کیا اور ہم ہی اس کے محافظ ہیں۔"'
                : lang === 'hi'
                ? '"बेशक हमने ही ये ज़िक्र नाज़िल किया और हम ही इसके निगहबान हैं।"'
                : '"Indeed, it is We who sent down the Reminder, and indeed, We will be its guardian."'}
            </div>
            <div style="font-size:0.6875rem; color:var(--ink-3); opacity:0.7;
                        text-align:center; letter-spacing:0.06em; text-transform:uppercase;">
              Al-Hijr 15:9
            </div>

            <!-- Gold bottom line -->
            <div style="height:1px; background:linear-gradient(90deg,transparent,var(--gold),transparent);
                        margin-top:18px; opacity:0.5;"></div>
          </div>
        </div>

      </div><!-- end hero -->

      <!-- CTA buttons -->
      <div class="fade-up btn-row"
           style="animation-delay:0.45s; padding:24px 24px max(28px,env(safe-area-inset-bottom));
                  position:relative; z-index:2;">
        <button class="btn btn-primary lift" onclick="showScreen('onboarding')">
          ${t('startJourney', lang)}
        </button>
        <button class="btn btn-ghost" onclick="showScreen('home')"
                style="text-align:center; color:var(--ink-3); font-size:0.875rem;">
          ${t('orSignIn', lang)} <span style="color:var(--gold);">${t('signIn', lang)}</span>
        </button>
      </div>

    </div>
  `;
}
