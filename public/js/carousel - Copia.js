class Carousel {
  constructor(container, options = {}) {
    this.container = container;
    this.track = container.querySelector(".carousel-track");
    this.slides = Array.from(this.track.children);
    this.dotsContainer = container.querySelector(".carousel-dots");
    this.prevBtn = container.querySelector(".carousel-arrow.left");
    this.nextBtn = container.querySelector(".carousel-arrow.right");

    this.options = {
      delay: 3000,
      autoplay: true,
      pauseOnHover: true,
      showDots: true,
      showArrows: true,
      infinite: true,
      transitionDuration: 500,
      effect: "slide",
      slidesToShow: 1,
      responsive: [],
      ...options,
    };

    // --- VARIABILI PER IL DRAG ---
    this.isDragging = false;
    this.startPos = 0;
    this.currentTranslate = 0;
    this.prevTranslate = 0;
    this.animationID = 0;
    // ----------------------------

    if (this.options.effect === "fade") {
      this.options.infinite = false;
    }

    this.currentIndex = 0;
    this.intervalId = null;
    this.isTransitioning = false;
    this.currentSlidesToShow = this.options.slidesToShow;

    this.init();
  }

  init() {
    this.setupSlides();
    this.setupClones();
    this.setSlidesWidth();
    this.setupDots();
    this.updateDots();
    this.attachEvents();

    if (this.options.effect === "fade") {
      this.setupFade();
    } else {
      this.goToSlide(this.currentIndex, false);
    }

    window.addEventListener("resize", () => this.handleResize());

    if (this.options.autoplay) {
      this.startAutoplay();
    }

    setTimeout(() => {
      this.handleResize();
    }, 100);
  }

  setupSlides() {
    this.slides = Array.from(this.track.children);
  }

  setupClones() {
    this.track.querySelectorAll(".clone").forEach((c) => c.remove());
    if (this.options.effect === "slide" && this.options.infinite) {
      const count = this.currentSlidesToShow;
      const first = this.slides.slice(0, count).map((s) => s.cloneNode(true));
      const last = this.slides.slice(-count).map((s) => s.cloneNode(true));
      first.forEach((clone) => {
        clone.classList.add("clone");
        this.track.appendChild(clone);
      });
      last.reverse().forEach((clone) => {
        clone.classList.add("clone");
        this.track.insertBefore(clone, this.track.firstChild);
      });
      this.setupSlides();
      this.currentIndex = count;
    } else {
      this.currentIndex = 0;
    }
  }

  setSlidesWidth() {
    const widthPct = 100 / this.currentSlidesToShow;
    this.container.style.setProperty('--slides-to-show', this.currentSlidesToShow);

    this.slides.forEach((slide) => {
      slide.style.width = `${widthPct}%`;
      // Impedisce il trascinamento nativo delle immagini per non rompere il drag custom
      const img = slide.querySelector('img');
      if (img) img.draggable = false;

      if (this.options.effect === "fade") {
        slide.classList.add("fade");
      } else {
        slide.classList.remove("fade");
      }
    });
  }

  // --- LOGICA DRAG & SWIPE ---
  handleDragStart(e) {
    if (this.isTransitioning || this.options.effect === "fade") return;
    this.isDragging = true;
    this.startPos = this.getPositionX(e);
    this.stopAutoplay();
    this.track.style.transition = "none";
    this.container.classList.add('grabbing');
  }

  handleDragMove(e) {
    if (!this.isDragging) return;
    const currentPosition = this.getPositionX(e);
    const diff = currentPosition - this.startPos;
    const slideWidth = this.slides[0].offsetWidth;
    this.currentTranslate = -this.currentIndex * slideWidth + diff;
    this.track.style.transform = `translateX(${this.currentTranslate}px)`;
  }

  handleDragEnd() {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.container.classList.remove('grabbing');

    const slideWidth = this.slides[0].offsetWidth;
    const movedBy = this.currentTranslate - (-this.currentIndex * slideWidth);

    // Se spostato di oltre 100px, cambia slide, altrimenti torna indietro
    if (movedBy < -100) {
      this.nextSlide();
    } else if (movedBy > 100) {
      this.prevSlide();
    } else {
      this.goToSlide(this.currentIndex);
    }

    if (this.options.autoplay) this.startAutoplay();
  }

  getPositionX(e) {
    return e.type.includes('mouse') ? e.pageX : e.touches[0].clientX;
  }
  // ---------------------------

  attachEvents() {
    if (this.options.showArrows) {
      this.prevBtn.style.display = "block";
      this.nextBtn.style.display = "block";
      this.prevBtn.onclick = () => this.prevSlide();
      this.nextBtn.onclick = () => this.nextSlide();
    }

    // Eventi Mouse
    this.track.addEventListener('mousedown', (e) => this.handleDragStart(e));
    window.addEventListener('mousemove', (e) => this.handleDragMove(e));
    window.addEventListener('mouseup', () => this.handleDragEnd());

    // Eventi Touch
    this.track.addEventListener('touchstart', (e) => this.handleDragStart(e));
    this.track.addEventListener('touchmove', (e) => this.handleDragMove(e));
    this.track.addEventListener('touchend', () => this.handleDragEnd());

    if (this.options.pauseOnHover) {
      this.container.addEventListener("mouseenter", () => this.stopAutoplay());
      this.container.addEventListener("mouseleave", () => this.startAutoplay());
    }
    
    this.track.addEventListener("transitionend", () => this.onTransitionEnd());
  }

  goToSlide(idx, animate = true) {
    if (this.options.effect === "fade") {
      this.slides.forEach((s, i) => {
        s.style.transition = animate ? `opacity ${this.options.transitionDuration}ms ease-in-out` : "none";
        s.style.opacity = i === idx ? "1" : "0";
        s.classList.toggle("active", i === idx);
      });
      this.currentIndex = idx;
      this.updateDots();
    } else {
      this.isTransitioning = animate;
      const w = this.slides[0].offsetWidth;
      this.track.style.transition = animate ? `transform ${this.options.transitionDuration}ms ease-in-out` : "none";
      this.track.style.transform = `translateX(-${w * idx}px)`;
      this.currentIndex = idx;
      this.updateDots();
    }
  }

  nextSlide() {
    if (this.isTransitioning) return;
    const increment = this.options.infinite ? this.currentIndex + 1 : Math.min(this.currentIndex + 1, this.slides.length - this.currentSlidesToShow);
    this.goToSlide(increment);
  }

  prevSlide() {
    if (this.isTransitioning) return;
    const decrement = this.options.infinite ? this.currentIndex - 1 : Math.max(this.currentIndex - 1, 0);
    this.goToSlide(decrement);
  }

  onTransitionEnd() {
    if (!this.options.infinite || this.options.effect === "fade") {
      this.isTransitioning = false;
      return;
    }
    const slideCount = this.slides.length;
    const clones = this.currentSlidesToShow;
    if (this.currentIndex >= slideCount - clones) {
      this.track.style.transition = "none";
      this.currentIndex = clones;
      const w = this.slides[0].offsetWidth;
      this.track.style.transform = `translateX(-${w * this.currentIndex}px)`;
    } else if (this.currentIndex < clones) {
      this.track.style.transition = "none";
      this.currentIndex = slideCount - clones * 2;
      const w = this.slides[0].offsetWidth;
      this.track.style.transform = `translateX(-${w * this.currentIndex}px)`;
    }
    this.isTransitioning = false;
  }

  // ... (setupDots, updateDots, handleResize, setupFade, etc. rimangono invariati)
  setupDots() {
    if (!this.options.showDots || !this.dotsContainer) return;
    this.dotsContainer.innerHTML = "";
    const realSlidesCount = this.options.infinite ? this.slides.length - (2 * this.currentSlidesToShow) : this.slides.length;
    this.dots = [];
    for (let i = 0; i < realSlidesCount; i++) {
      const dot = document.createElement("span");
      dot.className = "carousel-dot";
      dot.onclick = () => this.goToSlide(this.options.infinite ? i + this.currentSlidesToShow : i);
      this.dotsContainer.appendChild(dot);
      this.dots.push(dot);
    }
  }

  updateDots() {
    if (!this.options.showDots || !this.dots) return;
    this.dots.forEach(d => d.classList.remove("active"));
    let idx = this.currentIndex;
    if (this.options.infinite) {
      idx -= this.currentSlidesToShow;
      if (idx < 0) idx = this.dots.length - 1;
      else if (idx >= this.dots.length) idx = 0;
    }
    this.dots[idx]?.classList.add("active");
  }

  handleResize() {
    const w = window.innerWidth;
    let newCount = this.options.slidesToShow;
    if (this.options.responsive) {
      this.options.responsive.forEach(bp => {
        if (w <= bp.breakpoint) newCount = bp.slidesToShow;
      });
    }
    if (newCount !== this.currentSlidesToShow) {
      this.currentSlidesToShow = newCount;
      this.setupClones();
      this.setSlidesWidth();
      this.setupDots();
      this.goToSlide(this.currentIndex, false);
    }
  }

  startAutoplay() {
    if (!this.options.autoplay) return;
    this.stopAutoplay();
    this.intervalId = setInterval(() => this.nextSlide(), this.options.delay);
  }

  stopAutoplay() {
    clearInterval(this.intervalId);
  }
}