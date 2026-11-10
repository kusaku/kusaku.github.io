# kusaku.su

Personal website of Kirill Arkhipenko (Кирилл Архипенко).

Hosted on GitHub Pages: [kusaku.su](https://kusaku.su) / [kusaku.github.io](https://kusaku.github.io)

## Structure

- `index.html`: Jekyll-backed homepage
- `blog/`: Jekyll blog index
- `_posts/`: Markdown blog posts
- `legacy/`: untouched archive of legacy projects and websites
- `soundcloud-api/`: tiny Node.js proxy for the homepage SoundCloud player

## Local development

```bash
bundle install
bundle exec jekyll serve
```

## Deployment

GitHub Actions deploys the site to GitHub Pages and the SoundCloud API separately.
