import os
import yaml
from jinja2 import Template

def process_templates(config_file='initializer_config.yaml'):
    # 1. Carica i dati dal file YAML
    if not os.path.exists(config_file):
        print(f"Errore: {config_file} non trovato.")
        return
    
    with open(config_file, 'r') as f:
        config = yaml.safe_load(f)

    # 2. Cammina attraverso tutte le cartelle partendo dalla posizione attuale
    # Iniziamo dalla cartella corrente '.'
    for root, dirs, files in os.walk('.'):
        for filename in files:
            if filename.endswith('.j2'):
                template_path = os.path.join(root, filename)
                
                # Calcola il nome del file finale (rimuovendo .j2)
                # Se il file è il manifest, lo rinominiamo col nome del proxy
                if filename == "manifest.xml.j2":
                    new_filename = f"{config['proxy_name']}.xml"
                else:
                    new_filename = filename[:-3]  # Rimuove '.j2'
                
                output_path = os.path.join(root, new_filename)

                print(f"Elaborazione: {template_path} -> {output_path}")

                try:
                    # Legge e renderizza il template
                    with open(template_path, 'r', encoding='utf-8') as f:
                        template_content = Template(f.read())
                    
                    rendered_content = template_content.render(config)

                    # Usiamo encoding='utf-8' (senza BOM) e forziamo newline a stile Unix
                    with open(output_path, 'w', encoding='utf-8', newline='\n') as f:
                        f.write(rendered_content)

                    # Elimina il template originale .j2
                    os.remove(template_path)
                    
                except Exception as e:
                    print(f"Errore durante l'elaborazione di {filename}: {e}")

    print("\n✅ Trasformazione completata. I file .j2 sono stati sostituiti dal codice generato.")

if __name__ == "__main__":
    process_templates()