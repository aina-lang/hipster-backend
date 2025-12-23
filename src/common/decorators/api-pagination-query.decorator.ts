import { applyDecorators } from '@nestjs/common';
import { ApiQuery, ApiQueryOptions } from '@nestjs/swagger';

export function ApiPaginationQueries(extraQueries: ApiQueryOptions[] = []) {
  return applyDecorators(
    ApiQuery({
      name: 'page',
      required: false,
      type: Number,
      description: 'Numéro de page (1 par défaut)',
    }),
    ApiQuery({
      name: 'limit',
      required: false,
      type: Number,
      description: 'Nombre de résultats par page',
    }),
    ApiQuery({
      name: 'search',
      required: false,
      type: String,
      description: 'Texte de recherche pleine',
    }),
    ApiQuery({
      name: 'sortBy',
      required: false,
      type: String,
      description: 'Champ de tri',
    }),
    ApiQuery({
      name: 'sortOrder',
      required: false,
      enum: ['ASC', 'DESC'],
      description: 'Ordre de tri',
    }),
    ...extraQueries.map((options) => ApiQuery(options)),
  );
}
