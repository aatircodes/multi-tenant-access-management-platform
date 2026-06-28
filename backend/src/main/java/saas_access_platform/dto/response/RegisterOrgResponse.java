package saas_access_platform.dto.response;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class RegisterOrgResponse {
    private String message;
    private String orgSlug;
}