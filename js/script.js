// Scroll reveal
      const io = new IntersectionObserver(
        (e) =>
          e.forEach((x) => {
            if (x.isIntersecting) x.target.classList.add("visible");
          }),
        { threshold: 0.1 },
      );
      document.querySelectorAll(".reveal").forEach((r) => io.observe(r));

      // FAQ
      function toggleFaq(el) {
        const item = el.parentElement,
          wasOpen = item.classList.contains("open");
        document
          .querySelectorAll(".faq-item")
          .forEach((i) => i.classList.remove("open"));
        if (!wasOpen) item.classList.add("open");
      }

      // Credits
      function selectCredit(el) {
        document
          .querySelectorAll(".credit-pack")
          .forEach((c) => c.classList.remove("selected"));
        el.classList.add("selected");
      }

      // Toast
      function showToast(msg) {
        const t = document.getElementById("toast");
        t.textContent = msg;
        t.classList.add("show");
        setTimeout(() => t.classList.remove("show"), 3000);
      }

      // Mobile nav
      function toggleMobileNav() {
        document.getElementById("mobile-nav").classList.toggle("open");
      }
      function closeMobileNav() {
        document.getElementById("mobile-nav").classList.remove("open");
      }

      // Nav active state
      const sections = document.querySelectorAll("section[id],div[id]");
      window.addEventListener("scroll", () => {
        const y = window.scrollY + 100;
        sections.forEach((s) => {
          const link = document.querySelector(`.nav-links a[href="#${s.id}"]`);
          if (!link) return;
          link.style.color =
            s.offsetTop <= y && s.offsetTop + s.offsetHeight > y
              ? "var(--accent)"
              : "";
        });
      });