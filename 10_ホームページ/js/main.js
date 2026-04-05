/* =============================================
   企業のお医者さん - メインJavaScript
   ============================================= */

// --- Google Analytics (GA4) ---
// GA_MEASUREMENT_ID を実際の計測IDに置き換えてください
// window.dataLayer = window.dataLayer || [];
// function gtag(){dataLayer.push(arguments);}
// gtag('js', new Date());
// gtag('config', 'GA_MEASUREMENT_ID');

document.addEventListener('DOMContentLoaded', function () {

  // =============================================
  // ハンバーガーメニュー
  // =============================================
  const hamburger = document.querySelector('.hamburger');
  const navList = document.querySelector('.nav__list');

  if (hamburger && navList) {
    hamburger.addEventListener('click', function () {
      hamburger.classList.toggle('active');
      navList.classList.toggle('open');
      document.body.style.overflow = navList.classList.contains('open') ? 'hidden' : '';
    });

    // ナビリンククリックでメニューを閉じる
    navList.querySelectorAll('.nav__link').forEach(function (link) {
      link.addEventListener('click', function () {
        hamburger.classList.remove('active');
        navList.classList.remove('open');
        document.body.style.overflow = '';
      });
    });
  }

  // =============================================
  // アクティブナビゲーション
  // =============================================
  const currentPath = window.location.pathname;
  document.querySelectorAll('.nav__link').forEach(function (link) {
    const href = link.getAttribute('href');
    if (href && currentPath.endsWith(href)) {
      link.classList.add('active');
    }
  });

  // =============================================
  // スクロールアニメーション（Intersection Observer）
  // =============================================
  const revealElements = document.querySelectorAll('.reveal');

  if (revealElements.length > 0 && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.12,
      rootMargin: '0px 0px -40px 0px'
    });

    revealElements.forEach(function (el) {
      observer.observe(el);
    });
  } else {
    // IntersectionObserver 非対応ブラウザのフォールバック
    revealElements.forEach(function (el) {
      el.classList.add('visible');
    });
  }

  // =============================================
  // FAQ アコーディオン
  // =============================================
  const faqItems = document.querySelectorAll('.faq-item');

  faqItems.forEach(function (item) {
    const question = item.querySelector('.faq-item__q');
    if (question) {
      question.addEventListener('click', function () {
        const isOpen = item.classList.contains('open');

        // 他のFAQを閉じる
        faqItems.forEach(function (other) {
          other.classList.remove('open');
        });

        // クリックされたものをトグル
        if (!isOpen) {
          item.classList.add('open');
        }
      });
    }
  });

  // =============================================
  // スムーススクロール（ページ内リンク）
  // =============================================
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;

      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        const headerHeight = document.querySelector('.header')?.offsetHeight || 0;
        const top = target.getBoundingClientRect().top + window.pageYOffset - headerHeight - 16;
        window.scrollTo({ top: top, behavior: 'smooth' });
      }
    });
  });

  // =============================================
  // ヘッダー スクロール時のシャドウ
  // =============================================
  const header = document.querySelector('.header');
  if (header) {
    window.addEventListener('scroll', function () {
      if (window.scrollY > 20) {
        header.style.boxShadow = '0 4px 20px rgba(0,0,0,0.12)';
      } else {
        header.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
      }
    }, { passive: true });
  }

});
