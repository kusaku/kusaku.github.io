# kusaku.su

Personal website of Kirill Arkhipenko (Кирилл Архипенко).

Hosted on GitHub Pages: [kusaku.su](https://kusaku.su) / [kusaku.github.io](https://kusaku.github.io)

## Structure

- `index.html`: Jekyll-backed homepage
- `blog/`: Jekyll blog index
- `_posts/`: Markdown blog posts
- `legacy/`: untouched archive of legacy projects and websites

## Local development

```bash
bundle install
bundle exec jekyll serve
```

## Deployment

Deployment runs through GitHub Pages with the workflow at `.github/workflows/pages.yml`.
