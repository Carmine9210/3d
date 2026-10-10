-- Categorie iniziali (blueprint §04) e configurazione di default

insert into public.categories (slug, name_it, name_en, sort_order) values
  ('casa-decorazione',   'Casa e decorazione',        'Home & decor',            1),
  ('gadget-regali',      'Gadget e regali',           'Gadgets & gifts',         2),
  ('gaming-accessori',   'Gaming e accessori',        'Gaming & accessories',    3),
  ('cosplay-costumi',    'Cosplay e costumi',         'Cosplay & costumes',      4),
  ('miniature-modellismo','Miniature e modellismo',   'Miniatures & modelling',  5),
  ('ricambi-componenti', 'Ricambi e componenti',      'Spare parts & components',6),
  ('automotive',         'Automotive',                'Automotive',              7),
  ('ufficio-organizzazione','Ufficio e organizzazione','Office & organisation',  8),
  ('elettronica-supporti','Elettronica e supporti',   'Electronics & mounts',    9),
  ('prototipazione-b2b', 'Prototipazione e B2B',      'Prototyping & B2B',      10),
  ('articoli-personalizzati','Articoli personalizzati','Personalised items',     11),
  ('design-arte',        'Design e arte',             'Design & art',           12)
on conflict (slug) do nothing;

insert into public.app_config (key, value) values
  ('default_commission_bps', '1000'::jsonb),
  ('auto_publish_threshold', '3'::jsonb),
  ('shipping_flat_cents',    '490'::jsonb),
  ('free_shipping_over_cents','6000'::jsonb)
on conflict (key) do nothing;
