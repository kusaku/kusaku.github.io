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

For local SoundCloud API testing, provide the required environment variables
locally and run:

```bash
cd soundcloud-api
PORT=8787 npm run dev
```

The homepage JavaScript automatically uses
`http://127.0.0.1:8787/api/soundcloud` when the site is opened from localhost.

## Deployment

The static site deploys through GitHub Pages. The SoundCloud API deploys through
its own GitHub Actions workflow and expects its runtime secrets to be configured
outside the repository.
