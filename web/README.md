# Web server for nanoweb

## Data

### Settings in _.yaml

Possible to put in every data directory load as nested settings.

## Templates

## Localization

Define a default language in the very beginning, otherwise you need to move a lot of data between folders when changing a default language.

1. Data files in folders with the languages defined in `data/_/langs.yaml` in the format `[ { title, code, url } ]`, the **first language is always default**:
    ```yaml
    - title: Укр
      code: uk
      url: /
    - title: Eng
      code: en
      url: /en/
    - title: Spanish
      code: es
      url: /es/
    ```
1. Connect pages with the default language by the variable `$refer`, for instance English version of the history page refers to Ukrainian історія `data/en/history.yaml`:
    ```yaml
    $refer: /історія.html

    title: History – Heritage Rescue Headquarters
    heading1: History
    ```
1. Merging attributes with the default language page data, for instance English version of the 404 page has, `data/en/404.yaml`:
    ```yaml
    $refer: /404.html

    title: Page Not Found - Heritage Rescue Headquarters
    heading1: Page Not Found
    ```
    but in Ukrainian version `$template` is defined, so it will be used for the English version of 404 page, and so as all other missing properties `{ $template, ogImage }` will be loaded from `data/404.yaml`:
    ```yaml
    $template: /404

    title: Сторінка не знайдена - Штаб порятунку спадщини
    heading1: Сторінка не знайдена
    ogImage: /img/404.jpg
    ```
1. Alternates global property `$alternates` is related to only current page loaded, it contains the language code and url for every available refered/connected page to the original `{ lang: url }`, example of using it in the `head.ejs`
    ```ejs
    <% 'undefined' !== typeof $alternates && Object.entries($alternates).forEach(([l, u]) => { %>
    <link rel="alternate" hreflang="<%= l %>" href="<%= u %>" />
    <% }) %>
    ```
    or as in `nav.ejs`
    ```ejs
    <% global.langs.forEach((l, i) => { %>
        <li class="nav-item">
            <% if (l.code === $lang) { %>
                <span class="nav-link active"><%= l.title %></span>
            <% } else { %>
                <a href="<%= $alternates[l.code] || l.url %>" class="nav-link"><%= l.title %></a>
            <% } %>
        </li>
    <% }) %>
    ```


### Standard
The standard layout for the page render.
```
Location: ./views/_/layout/standard.ejs
```

Accepts:
- title, heading1, content, contentImg
- articles: [ { title, imgUrl, content, files: [ { src, alt } ] } ]

#### Content format

Available HTML structured as a tree `data/uk/apocalipsys/derzhavi.yaml`.
```yaml
- $class: book bg-black bg-opacity-72
    $data-nw-toggle: section/filter-none/img
    $id: v1
    section:
    - $tag: figure
        content: 
        - img: true
            $src: /img/uk/terms/falsehood.jpg
            $alt: Крах державИ
    - article:
        - h2: Держава Ук•раї•на фактично досі не існує.
```

It is possible to
1. use standard tags defined in `src/ejs/functions.js`: CLOSED_TAGS, DEFINED_TAGS.
1. provide element attributes starting with `$`, for instance `$class=book bg-black-opacity-72`.
1. own tags for child elements are `content`, `text`, they might be:
    - arrays, that provide lists of the object or their content;
    - objects, that print as attributes of the element;
    - scalar types, that print as a content of the element.

That renders:

```html
<section class="book bg-black bg-opacity-72" data-nw-toggle="section/filter-none/img" id="v1">
    <figure>
        <img src="/img/uk/terms/falsehood.jpg" alt="Крах державИ">
    </figure>
    <article>
        <h2>
            <span>Держава Ук•раї•на фактично досі не існує.</span>
        </h2>
    </article>
</section>
```

### Redirect
Redirect functionality based on HTML `<meta>` defined in the post data 
```data/uk/index.yaml
$redirect: /uk/terms.html
```

