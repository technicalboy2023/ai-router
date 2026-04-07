import { Router } from 'express';

const router = Router();

router.post('/', async (req, res, next) => {
  try {
    const { deps, config } = res.locals;
    const { fallbackEngine } = deps;
    const requestId = req.requestId;

    const { input, model: bodyModel, ...extraParams } = req.body;
    let model = bodyModel;

    if (!input) {
      throw Object.assign(new Error('Missing required "input" in request body'), { statusCode: 400 });
    }

    // Default model if none defined in request
    if (!model) {
      // Pick a sane default or openrouter/auto
      model = config.providers?.openrouter?.defaultModel || 'text-embedding-3-small';
    }

    const cancelController = new AbortController();
    req.on('close', () => cancelController.abort());

    const response = await fallbackEngine.executeEmbed(input, model, {
      extraParams,
      requestId,
      signal: cancelController.signal
    });

    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
});

export default router;
