import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as tf from '@tensorflow/tfjs-node';
import * as nsfwjs from 'nsfwjs';

// Classes returned by the NSFWJS MobileNetV2 model, in this fixed order.
type NsfwClassName = 'Drawing' | 'Hentai' | 'Neutral' | 'Porn' | 'Sexy';

const HENTAI_PORN_THRESHOLD = 0.7;
const SEXY_THRESHOLD = 0.85;

@Injectable()
export class KookNsfwService implements OnModuleInit {
  private readonly logger = new Logger(KookNsfwService.name);
  private model: nsfwjs.NSFWJS | null = null;
  private loadingPromise: Promise<nsfwjs.NSFWJS> | null = null;

  async onModuleInit() {
    // Warm up the model at boot so the first upload isn't slowed down by the download/load.
    this.getModel().catch((e) =>
      this.logger.error(`Échec du chargement initial du modèle NSFW: ${e?.message || e}`),
    );
  }

  private getModel(): Promise<nsfwjs.NSFWJS> {
    if (this.model) return Promise.resolve(this.model);
    if (!this.loadingPromise) {
      this.loadingPromise = nsfwjs.load().then((model) => {
        this.model = model;
        this.logger.log('Modèle NSFW chargé');
        return model;
      });
    }
    return this.loadingPromise;
  }

  /**
   * Classifies an image buffer and throws a BadRequestException if it looks like
   * pornographic/hentai/sexy content. Fails open (lets the upload through) if the
   * classification itself errors out (corrupt image, model unavailable, etc.) so a
   * technical failure never silently blocks legitimate uploads.
   */
  async assertSafe(buffer: Buffer): Promise<void> {
    let tensor: tf.Tensor3D | null = null;
    try {
      const model = await this.getModel();
      tensor = tf.node.decodeImage(buffer, 3) as tf.Tensor3D;
      const predictions = await model.classify(tensor);
      this.logNsfwPredictions(predictions);

      const score = (name: NsfwClassName) =>
        predictions.find((p) => p.className === name)?.probability ?? 0;

      const isFlagged =
        score('Porn') >= HENTAI_PORN_THRESHOLD ||
        score('Hentai') >= HENTAI_PORN_THRESHOLD ||
        score('Sexy') >= SEXY_THRESHOLD;

      if (isFlagged) {
        throw new BadRequestException(
          'Cette image contient du contenu inapproprié (nudité) et ne peut pas être publiée.',
        );
      }
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      this.logger.warn(`Vérification NSFW ignorée (erreur technique): ${e?.message || e}`);
    } finally {
      tensor?.dispose();
    }
  }

  private logNsfwPredictions(predictions: { className: string; probability: number }[]) {
    this.logger.debug(
      predictions.map((p) => `${p.className}=${p.probability.toFixed(2)}`).join(' '),
    );
  }
}
