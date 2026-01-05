class Carousel {
    constructor(container, options = {}) {
        this.container = container;
        this.track = container.querySelector(".carousel-track");
        this.dotsContainer = container.querySelector(".carousel-dots");
        this.prevBtn = container.querySelector(".carousel-arrow.left");
        this.nextBtn = container.querySelector(".carousel-arrow.right");

        // --- OPZIONI PREDEFINITE ---
        this.options = {
            delay: 3000,
            autoplay: true,
            pauseOnHover: true,
            showDots: true,
            showArrows: true,
            infinite: true,
            transitionDuration: 800, // Più lento per il fade
            effect: "slide",         // "slide" o "fade"
            slidesToShow: 1,
            responsive: [],
            ...options,
        };

        this.currentIndex = 0;
        this.intervalId = null;
        this.isTransitioning = false;
        this.currentSlidesToShow = this.options.slidesToShow;
        
        // --- VARIABILI DRAG ---
        this.isDragging = false;
        this.startPos = 0;

        this.init();
    }

    init() {
        this.setupSlides();
        
        // Se è fade, non usiamo cloni e forziamo 1 slide alla volta
        if (this.options.effect === "fade") {
            this.currentSlidesToShow = 1;
        } else {
            this.setupClones();
        }

        this.setInitialStyles();
        this.setupDots();
        this.updateDots();
        this.attachEvents();

        if (this.options.autoplay) {
            this.startAutoplay();
        }

        // Fix per il calcolo delle larghezze al caricamento
        window.addEventListener("resize", () => this.handleResize());
        setTimeout(() => this.handleResize(), 100);
        
        // Mostra la prima slide
        this.goToSlide(this.currentIndex, false);
    }

    setupSlides() {
        this.slides = Array.from(this.track.children);
    }

    setupClones() {
        if (this.options.effect === "fade" || !this.options.infinite) return;
        
        this.track.querySelectorAll(".clone").forEach(c => c.remove());
        const count = this.currentSlidesToShow;
        const first = this.slides.slice(0, count).map(s => s.cloneNode(true));
        const last = this.slides.slice(-count).map(s => s.cloneNode(true));

        first.forEach(clone => {
            clone.classList.add("clone");
            this.track.appendChild(clone);
        });
        last.reverse().forEach(clone => {
            clone.classList.add("clone");
            this.track.insertBefore(clone, this.track.firstChild);
        });

        this.setupSlides();
        this.currentIndex = count;
    }

    setInitialStyles() {
        if (this.options.effect === "fade") {
            this.track.style.display = "block";
            this.track.style.position = "relative";
            
            this.slides.forEach((slide, i) => {
                slide.style.position = "absolute";
                slide.style.top = "0";
                slide.style.left = "0";
                slide.style.width = "100%";
                slide.style.opacity = i === this.currentIndex ? "1" : "0";
                slide.style.zIndex = i === this.currentIndex ? "1" : "0";
                slide.style.transition = `opacity ${this.options.transitionDuration}ms ease-in-out`;
            });
        } else {
            this.track.style.display = "flex";
            this.handleResize(); // Imposta le larghezze corrette
        }
    }

    handleResize() {
        const w = window.innerWidth;
        let newCount = this.options.slidesToShow;

        if (this.options.responsive && this.options.effect !== "fade") {
            this.options.responsive.forEach(bp => {
                if (w <= bp.breakpoint) newCount = bp.slidesToShow;
            });
        }

        this.currentSlidesToShow = newCount;
        const widthPct = 100 / this.currentSlidesToShow;

        this.slides.forEach(slide => {
            slide.style.width = `${widthPct}%`;
            if (slide.querySelector('img')) slide.querySelector('img').draggable = false;
        });

        if (this.options.effect === "slide") {
            this.goToSlide(this.currentIndex, false);
        }
    }

    goToSlide(idx, animate = true) {
        if (this.isTransitioning) return;
        if (animate) this.isTransitioning = true;

        if (this.options.effect === "fade") {
            this.slides.forEach((slide, i) => {
                slide.style.opacity = i === idx ? "1" : "0";
                slide.style.zIndex = i === idx ? "1" : "0";
                slide.classList.toggle("active", i === idx);
            });
            this.currentIndex = idx;
            setTimeout(() => this.isTransitioning = false, this.options.transitionDuration);
        } else {
            const slideWidth = this.slides[0].offsetWidth;
            this.track.style.transition = animate ? `transform ${this.options.transitionDuration}ms ease-in-out` : "none";
            this.track.style.transform = `translateX(-${slideWidth * idx}px)`;
            this.currentIndex = idx;
        }

        this.updateDots();
    }

    nextSlide() {
        let nextIdx = this.currentIndex + 1;
        
        if (this.options.effect === "fade") {
            if (nextIdx >= this.slides.length) nextIdx = 0;
            this.goToSlide(nextIdx);
        } else {
            if (!this.options.infinite && nextIdx > this.slides.length - this.currentSlidesToShow) return;
            this.goToSlide(nextIdx);
        }
    }

    prevSlide() {
        let prevIdx = this.currentIndex - 1;

        if (this.options.effect === "fade") {
            if (prevIdx < 0) prevIdx = this.slides.length - 1;
            this.goToSlide(prevIdx);
        } else {
            if (!this.options.infinite && prevIdx < 0) return;
            this.goToSlide(prevIdx);
        }
    }

    onTransitionEnd() {
        this.isTransitioning = false;
        if (this.options.effect === "fade" || !this.options.infinite) return;

        const count = this.currentSlidesToShow;
        if (this.currentIndex >= this.slides.length - count) {
            this.goToSlide(count, false);
        } else if (this.currentIndex < count) {
            this.goToSlide(this.slides.length - count * 2, false);
        }
    }

    setupDots() {
        if (!this.options.showDots || !this.dotsContainer) return;
        this.dotsContainer.innerHTML = "";
        
        const totalDots = this.options.effect === "fade" || !this.options.infinite 
            ? this.slides.length 
            : this.slides.length - (2 * this.currentSlidesToShow);

        this.dots = [];
        for (let i = 0; i < totalDots; i++) {
            const dot = document.createElement("span");
            dot.className = "carousel-dot";
            dot.onclick = () => {
                const target = (this.options.effect === "slide" && this.options.infinite) ? i + this.currentSlidesToShow : i;
                this.goToSlide(target);
            };
            this.dotsContainer.appendChild(dot);
            this.dots.push(dot);
        }
    }

    updateDots() {
        if (!this.dots) return;
        this.dots.forEach(d => d.classList.remove("active"));
        
        let idx = this.currentIndex;
        if (this.options.effect === "slide" && this.options.infinite) {
            idx -= this.currentSlidesToShow;
            if (idx < 0) idx = this.dots.length - 1;
            else if (idx >= this.dots.length) idx = 0;
        }
        
        if (this.dots[idx]) this.dots[idx].classList.add("active");
    }

    attachEvents() {
        if (this.options.showArrows && this.prevBtn && this.nextBtn) {
            this.prevBtn.onclick = () => this.prevSlide();
            this.nextBtn.onclick = () => this.nextSlide();
        }

        if (this.options.pauseOnHover) {
            this.container.onmouseenter = () => this.stopAutoplay();
            this.container.onmouseleave = () => this.startAutoplay();
        }

        this.track.addEventListener("transitionend", () => this.onTransitionEnd());
    }

    startAutoplay() {
        this.stopAutoplay();
        this.intervalId = setInterval(() => this.nextSlide(), this.options.delay);
    }

    stopAutoplay() {
        clearInterval(this.intervalId);
    }
}